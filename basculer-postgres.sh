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

# Lance une commande sur la machine déployée. Sa sortie revient telle quelle ; le bavardage de
# flyctl (« Connecting to fdaa:… ») part sur l'erreur standard et n'entre pas dans les résultats.
sur_la_machine() { flyctl ssh console -a "$APP" -C "$1"; }

secret_present() { flyctl secrets list -a "$APP" 2>/dev/null | grep -q "^ *$1 "; }

# ---------------------------------------------------------------- preparer
if [ "$ETAPE" = preparer ]; then
  echo "== La base existe-t-elle ? =="
  if flyctl status -a "$DB" >/dev/null 2>&1; then
    echo "Cluster $DB déjà là."
  elif [ "${CREER_LA_BASE:-}" = "true" ]; then
    # Créer une base engage une dépense mensuelle et un mode d'exploitation : le choix reste
    # explicite, jamais un effet de bord de la préparation.
    case "${MOTEUR:-mpg}" in
      mpg)
        echo "Création d'une base gérée par Fly (sauvegardes comprises, assistance Fly)."
        flyctl mpg create --name "$DB" --region "$REGION" --org personal --plan "${PLAN:-Basic}"
        echo "Base gérée créée. Note son identifiant : l'attachement se fait avec « flyctl mpg attach »." >&2
        echo "Relance ensuite cette étape." >&2
        exit 0
        ;;
      brut)
        echo "Création d'une base non gérée (moins chère, sauvegardes et reprise à ta charge)."
        flyctl postgres create --name "$DB" --region "$REGION" --org personal \
          --vm-size shared-cpu-1x --volume-size 1 --initial-cluster-size 1
        ;;
      *) echo "MOTEUR doit valoir mpg ou brut." >&2; exit 1 ;;
    esac
  else
    echo "Aucun cluster nommé $DB." >&2
    echo "Relance avec CREER_LA_BASE=true, et MOTEUR=mpg (gérée par Fly, sauvegardes comprises)" >&2
    echo "ou MOTEUR=brut (moins chère, sauvegardes et reprise à ta charge)." >&2
    exit 1
  fi

  echo "== Attacher la base sous un nom que le serveur ignore =="
  if secret_present "$FUTUR"; then
    echo "$FUTUR déjà posé, on garde le même."
  else
    # La sortie de « attach » contient la chaîne de connexion : elle ne doit pas atteindre le
    # journal d'un travail GitHub, que n'importe quel lecteur du dépôt peut ouvrir.
    if ! sortie=$(flyctl postgres attach "$DB" -a "$APP" --variable-name "$FUTUR" --yes 2>&1); then
      echo "Attachement impossible. Dernière ligne utile :" >&2
      echo "$sortie" | grep -iv 'postgres://' | tail -3 >&2
      exit 1
    fi
    echo "Base attachée sous $FUTUR. Le serveur ne la lit pas encore."
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
