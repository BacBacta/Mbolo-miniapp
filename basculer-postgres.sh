#!/usr/bin/env bash
# Fait passer la production du fichier JSON à PostgreSQL, en deux temps, sans jamais laisser
# l'application tourner sur une base vide. Relançable sans risque à chaque étape.
#
# Usage : FLY_API_TOKEN=... ./basculer-postgres.sh <étape> <nom-app> [nom-base] [région]
#   étape    : preparer | basculer | verifier
#   nom-app  : l'application déjà déployée (ex. mbolo-miniapp)
#   nom-base : le cluster PostgreSQL (défaut : <nom-app>-db)
#
# Pourquoi deux temps. « flyctl postgres attach » pose DATABASE_URL et redémarre l'application
# aussitôt : entre ce redémarrage et la fin de l'import, la production tourne sur une base vide.
# Personne ne retrouve son compte, et quelqu'un qui en recrée un pendant ce temps écrit dans la
# base que l'import s'apprête à remplir — deux comptes pour une personne, et un import qui ne
# peut plus repartir proprement. On attache donc sous un autre nom, DATABASE_URL_FUTURE, que le
# serveur ignore ; on importe ; on vérifie ; et on ne renomme qu'après.
#
# La chaîne de connexion n'est jamais affichée ni écrite sur le disque : elle ne fait que passer
# d'un secret Fly à un autre, à l'intérieur de la machine.
set -euo pipefail

ETAPE="${1:-}"
APP="${2:-}"
DB="${3:-${APP}-db}"
REGION="${4:-ams}"
FUTUR=DATABASE_URL_FUTURE
ORG=""
MOTEUR="${MOTEUR:-mpg}"

usage() {
  echo "Usage : FLY_API_TOKEN=... ./basculer-postgres.sh <preparer|basculer|verifier> <nom-app> [nom-base] [région]" >&2
  exit 1
}

[ -n "$ETAPE" ] && [ -n "$APP" ] || usage
case "$ETAPE" in preparer|basculer|verifier) ;; *) echo "Étape inconnue : $ETAPE" >&2; usage ;; esac

if [ -z "${FLY_API_TOKEN:-}" ]; then
  echo "FLY_API_TOKEN absent. Il doit être un jeton d'organisation (fly.io, Account puis Tokens) :" >&2
  echo "un jeton de déploiement ne peut pas créer de base." >&2
  exit 1
fi
command -v flyctl >/dev/null 2>&1 || { echo "flyctl introuvable : curl -fsSL https://fly.io/install.sh | sh" >&2; exit 1; }

# La machine s'arrête d'elle-même quand personne ne s'en sert (auto_stop_machines dans fly.toml),
# et « ssh console » ne sait pas entrer dans une machine arrêtée : « has no started VMs ». On la
# réveille donc comme le ferait un visiteur, par une requête — c'est le mécanisme prévu par l'app
# (auto_start_machines), pas un contournement.
reveiller() {
  for _ in $(seq 1 20); do
    curl -fsS --max-time 20 "https://$APP.fly.dev/health" >/dev/null 2>&1 && return 0
    sleep 3
  done
  return 1
}

# Lance une commande sur la machine déployée. Sa sortie revient telle quelle ; le bavardage de
# flyctl (« Connecting to fdaa:… ») part sur l'erreur standard et n'entre pas dans les résultats.
sur_la_machine() {
  reveiller || { echo "La machine $APP ne répond pas : impossible d'y lancer une commande." >&2; return 1; }
  flyctl ssh console -a "$APP" -C "$1"
}

# Un secret encore en attente d'application s'affiche préfixé d'une étoile (« * NOM ... Staged »).
# Ne pas l'admettre, c'est conclure que l'attachement a échoué alors qu'il a réussi.
secret_present() { flyctl secrets list -a "$APP" 2>/dev/null | grep -qE "^ *\\*? *$1 "; }

# Le secret existe côté Fly bien avant que la machine ne le voie. On demande donc à la machine,
# pas à Fly : c'est elle qui lira la variable au moment de l'import.
machine_voit() { [ -n "$(sur_la_machine "printenv $1" 2>/dev/null | tr -d '\r' | grep -v '^$' | tail -1)" ]; }

# ---------------------------------------------------------------- preparer
# Les deux moteurs ne se pilotent pas pareil. Une base gérée par Fly (« mpg ») se désigne par un
# identifiant, pas par son nom, et s'attache avec « flyctl mpg attach » ; une base non gérée est
# une app Fly ordinaire. Seules ces deux fonctions le savent ; le reste du script n'en dépend pas.
id_mpg() {
  # « mpg list » écrit une phrase en clair quand il n'y a aucune base, --json ou pas. La passer
  # à jq donne « parse error », qu'on lit alors comme une panne alors qu'il n'y a rien à lire.
  sortie=$(flyctl mpg list --org "$ORG" --json 2>/dev/null || true)
  case "$sortie" in
    '['*|'{'*) printf '%s' "$sortie" | jq -r --arg n "$DB" '.[]? | select(.name == $n) | .id' | head -1 ;;
    *) : ;;
  esac
}

# L'organisation n'est pas devinée : un jeton la connaît ou ne la connaît pas. FLY_ORG l'emporte
# pour qui en a plusieurs ; sinon on prend celle que le jeton voit.
resoudre_org() {
  [ -n "${FLY_ORG:-}" ] && { echo "$FLY_ORG"; return; }
  flyctl orgs list --json 2>/dev/null | jq -r 'keys[0] // empty' 2>/dev/null || true
}

creer_la_base() {
  case "$MOTEUR" in
    mpg)
      echo "Création d'une base gérée par Fly (sauvegardes et restauration comprises)."
      flyctl mpg create --name "$DB" --region "$REGION" --org "$ORG" --plan "${PLAN:-Basic}"
      # On relit la liste plutôt que la sortie de création : c'est l'état réel qui compte.
      [ -n "$(id_mpg)" ] || { echo "Base créée, mais introuvable dans la liste. Regarde : flyctl mpg list" >&2; exit 1; }
      ;;
    brut)
      echo "Création d'une base non gérée (moins chère, sauvegardes et reprise à ta charge)."
      flyctl postgres create --name "$DB" --region "$REGION" --org "$ORG" \
        --vm-size shared-cpu-1x --volume-size 1 --initial-cluster-size 1
      ;;
    *) echo "MOTEUR doit valoir mpg ou brut." >&2; exit 1 ;;
  esac
}

# La sortie de « attach » contient la chaîne de connexion : elle ne doit jamais atteindre le
# journal d'un travail GitHub, que n'importe quel lecteur du dépôt peut ouvrir.
attacher() {
  case "$MOTEUR" in
    mpg)
      id=$(id_mpg)
      [ -n "$id" ] || { echo "Base gérée $DB introuvable dans l'organisation $ORG." >&2; return 1; }
      flyctl mpg attach "$id" -a "$APP" --variable-name "$FUTUR" ;;
    brut) flyctl postgres attach "$DB" -a "$APP" --variable-name "$FUTUR" --yes ;;
  esac
}

if [ "$ETAPE" = preparer ]; then
  command -v jq >/dev/null 2>&1 || { echo "jq introuvable : apt-get install jq (il sert à lire la liste des bases gérées)." >&2; exit 1; }

  # Le jeton doit voir une organisation, sinon il ne peut ni créer ni attacher de base. Un jeton
  # de déploiement — celui qui suffit à « flyctl deploy » — n'en voit aucune, et Fly répond alors
  # « Organization not found » : on croit à un nom mal orthographié, et on cherche des heures.
  # Ce contrôle passe avant tout, pour échouer sans avoir rien créé.
  ORG=$(resoudre_org)
  if [ -z "$ORG" ]; then
    echo "Ce jeton ne voit aucune organisation Fly : il ne peut ni créer ni attacher de base." >&2
    echo "C'est le cas d'un jeton de déploiement, limité à une seule app — celui qui suffit à déployer." >&2
    echo "Crée un jeton d'organisation sur fly.io (Account puis Tokens), et remplace le secret" >&2
    echo "FLY_API_TOKEN du dépôt par celui-là. Rien n'a été créé ni modifié." >&2
    exit 1
  fi
  echo "Organisation : $ORG"

  # Une préparation déjà faite ne se refait pas : le secret est la preuve que la base existe et
  # qu'elle est attachée. Sans ce raccourci, relancer l'étape après une coupure pendant l'import
  # essaierait de recréer une base — et en ferait une seconde, facturée, à côté de la bonne.
  if secret_present "$FUTUR"; then
    echo "== Base déjà préparée =="
    echo "$FUTUR est posé : la base est là et attachée. On passe à l'import."
  else
    echo "== La base existe-t-elle ? =="
    case "$MOTEUR" in
      mpg) existe=$([ -n "$(id_mpg)" ] && echo oui || echo non) ;;
      brut) existe=$(flyctl status -a "$DB" >/dev/null 2>&1 && echo oui || echo non) ;;
      *) echo "MOTEUR doit valoir mpg ou brut." >&2; exit 1 ;;
    esac

    if [ "$existe" = oui ]; then
      echo "Base $DB déjà là."
    elif [ "${CREER_LA_BASE:-}" = "true" ]; then
      # Créer une base engage une dépense mensuelle et un mode d'exploitation : le choix reste
      # explicite, jamais un effet de bord de la préparation.
      creer_la_base
    else
      echo "Aucune base nommée $DB (moteur $MOTEUR)." >&2
      echo "Relance avec CREER_LA_BASE=true, et MOTEUR=mpg (gérée par Fly, sauvegardes comprises)" >&2
      echo "ou MOTEUR=brut (moins chère, sauvegardes et reprise à ta charge)." >&2
      exit 1
    fi

    echo "== Attacher la base sous un nom que le serveur ignore =="
    if ! sortie=$(attacher 2>&1); then
      echo "Attachement impossible. Dernières lignes utiles :" >&2
      echo "$sortie" | grep -iv 'postgres://' | tail -3 >&2
      exit 1
    fi
    secret_present "$FUTUR" || { echo "L'attachement n'a pas posé $FUTUR sur $APP." >&2; exit 1; }
    echo "Base attachée sous $FUTUR. Le serveur ne la lit pas encore."
  fi

  # « attach » pose le secret en attente : il existe côté Fly, mais la machine tourne encore sans
  # lui. L'import lirait alors une variable vide et croirait qu'aucune base ne lui est donnée.
  echo "== Le secret est-il appliqué sur la machine ? =="
  if machine_voit "$FUTUR"; then
    echo "La machine voit $FUTUR."
  else
    echo "$FUTUR est posé mais pas encore appliqué. Déploiement des secrets en attente."
    flyctl secrets deploy -a "$APP"
    machine_voit "$FUTUR" || {
      echo "La machine ne voit toujours pas $FUTUR, l'import lirait une base vide." >&2
      echo "Regarde : flyctl secrets list -a $APP" >&2
      exit 1
    }
  fi

  echo "== Reprendre le fichier JSON =="
  # Le serveur tourne toujours sur db.json pendant cet import : il continue de servir.
  sur_la_machine "sh -c 'DATABASE_URL=\"\$$FUTUR\" node scripts/import-json.js /data/db.json'"

  echo "== L'import est-il complet ? =="
  sur_la_machine "sh -c 'DATABASE_URL=\"\$$FUTUR\" node scripts/etat-stockage.js /data/db.json'"

  echo
  echo "Prêt. La production tourne encore sur le fichier ; rien n'a changé pour personne."
  echo "Quand tu veux échanger : ./basculer-postgres.sh basculer $APP $DB"
  exit 0
fi

# ---------------------------------------------------------------- basculer
if [ "$ETAPE" = basculer ]; then
  secret_present "$FUTUR" || { echo "$FUTUR absent : lance d'abord l'étape preparer." >&2; exit 1; }

  echo "== Dernier contrôle avant d'échanger =="
  # Refait la vérification maintenant, et pas seulement à l'import : entre les deux, quelqu'un a
  # pu écrire dans le fichier. Sortie non nulle ici, et on ne bascule pas.
  sur_la_machine "sh -c 'DATABASE_URL=\"\$$FUTUR\" node scripts/etat-stockage.js /data/db.json'"

  echo "== Échange =="
  URL=$(sur_la_machine "printenv $FUTUR" 2>/dev/null | tr -d '\r' | grep '^postgres' | tail -1)
  [ -n "$URL" ] || { echo "Impossible de relire $FUTUR depuis la machine." >&2; exit 1; }
  # Sous GitHub Actions, la chaîne est masquée dans le journal même si une commande la recopie.
  [ -n "${GITHUB_ACTIONS:-}" ] && echo "::add-mask::$URL"
  # --stage : posé sans redémarrer, puis le retrait de l'ancien nom applique les deux d'un coup.
  flyctl secrets set --stage -a "$APP" DATABASE_URL="$URL" >/dev/null
  flyctl secrets unset -a "$APP" "$FUTUR" >/dev/null
  echo "DATABASE_URL posé, $FUTUR retiré. La machine redémarre."

  echo "== Contrôle =="
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 10 "https://$APP.fly.dev/health" | grep -q '"ok":true'; then
      echo "L'application répond."
      # La preuve que la bascule a pris : le serveur l'écrit lui-même au démarrage.
      if flyctl logs -a "$APP" --no-tail 2>/dev/null | grep -m1 'Stockage : PostgreSQL'; then
        echo
        echo "Bascule faite. Garde /data/db.json quelques jours avant de l'effacer."
        exit 0
      fi
      echo "Répond, mais le journal ne dit pas encore « Stockage : PostgreSQL »." >&2
      echo "Regarde : flyctl logs -a $APP" >&2
      exit 1
    fi
    sleep 3
  done
  echo "L'application ne répond plus après l'échange. Journal : flyctl logs -a $APP" >&2
  echo "Pour revenir en arrière : flyctl secrets unset -a $APP DATABASE_URL (le fichier JSON est intact)." >&2
  exit 1
fi

# ---------------------------------------------------------------- verifier
echo "== Sur quoi tourne la production ? =="
if secret_present DATABASE_URL; then
  echo "DATABASE_URL est posé : le serveur lit PostgreSQL."
  echo "== Contenu de la base =="
  sur_la_machine "node scripts/etat-stockage.js /data/db.json"
elif secret_present "$FUTUR"; then
  echo "Le serveur lit encore /data/db.json ; la base d'arrivée est prête mais pas branchée."
  echo "== Contenu de la base d'arrivée =="
  sur_la_machine "sh -c 'DATABASE_URL=\"\$$FUTUR\" node scripts/etat-stockage.js /data/db.json'"
else
  echo "DATABASE_URL absent, et aucune base préparée : le serveur lit /data/db.json."
  echo "Pour commencer : ./basculer-postgres.sh preparer $APP $DB"
fi
