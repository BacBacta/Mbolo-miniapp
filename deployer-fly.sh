#!/usr/bin/env bash
# Déploie l'application sur Fly. Relançable sans risque : crée ce qui manque, laisse le reste.
#
# Usage : FLY_API_TOKEN=... ./deployer-fly.sh <nom-app> [région]
#   nom-app : unique dans le monde entier (ex. mbolo-beta)
#   région  : cdg Paris (défaut), jnb Johannesburg, mad Madrid
#
# Secrets lus dans l'environnement : BOT_TOKEN et ADMIN_CHAT_ID (obligatoires),
# ADMIN_KEY, WEBHOOK_SECRET et WEB_SESSION_SECRET (générés s'ils manquent). Aucun n'est écrit sur le disque
# ni affiché.
set -euo pipefail

APP="${1:-}"
REGION="${2:-cdg}"
VOLUME=mbolo_data

if [ -z "$APP" ]; then
  echo "Usage : FLY_API_TOKEN=... ./deployer-fly.sh <nom-app> [région]" >&2
  exit 1
fi
if [ -z "${FLY_API_TOKEN:-}" ]; then
  echo "FLY_API_TOKEN absent. Crée un jeton sur https://fly.io, Account puis Tokens." >&2
  exit 1
fi
if [ -z "${BOT_TOKEN:-}" ]; then
  echo "BOT_TOKEN absent : sans lui le bot ne démarre pas." >&2
  exit 1
fi
# Le déploiement tourne en NODE_ENV=production : la validation automatique des selfies y est
# éteinte, et sans groupe de modération personne ne peut être vérifié. Le serveur refuserait de
# démarrer ; autant le dire ici, avant de construire une image pour rien.
if [ -z "${ADMIN_CHAT_ID:-}" ]; then
  echo "ADMIN_CHAT_ID absent : les selfies n'iraient nulle part et personne ne pourrait être vérifié." >&2
  echo "Crée un groupe Telegram, ajoute-y ton bot, envoie /id dans le groupe, puis mets la valeur" >&2
  echo "obtenue dans ADMIN_CHAT_ID (secret du dépôt GitHub, ou variable d'environnement)." >&2
  exit 1
fi
command -v flyctl >/dev/null 2>&1 || { echo "flyctl introuvable : curl -fsSL https://fly.io/install.sh | sh" >&2; exit 1; }

echo "== Compte =="
flyctl auth whoami

echo "== Nom et région dans fly.toml =="
sed -i.bak "s/^app = .*/app = \"$APP\"/; s/^primary_region = .*/primary_region = \"$REGION\"/" fly.toml
rm -f fly.toml.bak
head -3 fly.toml

echo "== Application =="
# Créer une app qui existe déjà échoue : ce n'est pas une erreur pour nous
flyctl apps create "$APP" --org personal || echo "App $APP déjà présente, on continue."

echo "== Volume de données =="
# Fly accepte plusieurs volumes du même nom : sans ce contrôle, chaque lancement en ajouterait un
if flyctl volumes list -a "$APP" 2>/dev/null | grep -qw "$VOLUME"; then
  echo "Volume $VOLUME déjà présent."
else
  flyctl volumes create "$VOLUME" -a "$APP" --region "$REGION" --size 1 --yes
fi

echo "== Adresses IP publiques =="
# Sans IP publique, <app>.fly.dev ne se résout nulle part. L'app démarre et
# répond à /health en interne, mais ni Telegram ni personne ne peut la joindre.
IPS=$(flyctl ips list -a "$APP" --json 2>/dev/null || true)
IP_NEUVE=0
if echo "$IPS" | grep -qE '"(shared_)?v4"'; then
  echo "IPv4 déjà allouée."
else
  # --shared : gratuite, et suffisante ici (Fly route par SNI)
  flyctl ips allocate-v4 --shared -a "$APP"
  IP_NEUVE=1
fi
if echo "$IPS" | grep -q '"v6"'; then
  echo "IPv6 déjà allouée."
else
  flyctl ips allocate-v6 -a "$APP"
  IP_NEUVE=1
fi

echo "== Secrets =="
# Le secret des sessions web est tiré au hasard au premier déploiement, puis laissé tel quel :
# le reposer à chaque fois déconnecterait la modération à chaque mise en ligne.
set -- BOT_TOKEN="$BOT_TOKEN" \
  ADMIN_KEY="${ADMIN_KEY:-$(head -c 32 /dev/urandom | base64 | tr -d '/+=')}" \
  WEBHOOK_SECRET="${WEBHOOK_SECRET:-$(head -c 32 /dev/urandom | base64 | tr -d '/+=')}" \
  ADMIN_CHAT_ID="$ADMIN_CHAT_ID"
if [ -n "${WEB_SESSION_SECRET:-}" ] && { [ "$WEB_SESSION_SECRET" = "${ADMIN_KEY:-}" ] || [ "$WEB_SESSION_SECRET" = "$BOT_TOKEN" ]; }; then
  # Le 14 septembre 2026, le secret WEB_SESSION_SECRET du dépôt GitHub portait la valeur
  # d'ADMIN_KEY. Le serveur refusait donc de démarrer (server/secrets.js), et chaque déploiement
  # reposait la même paire depuis le dépôt : une correction à la main chez l'hébergeur ne tenait
  # pas jusqu'au déploiement suivant. C'est le secret qui coûte le moins à changer — il ne ferme
  # que les sessions de modération en cours — alors on en tire un plutôt que d'en poser une copie.
  echo "WEB_SESSION_SECRET porte la même valeur qu'un autre secret : je n'en pose pas une copie." >&2
  echo "J'en tire un au hasard pour ce déploiement. Les sessions de modération en cours se ferment," >&2
  echo "et ce sera le cas à chaque déploiement tant que le secret WEB_SESSION_SECRET du dépôt GitHub" >&2
  echo "(Settings, Secrets and variables, Actions) n'aura pas sa propre valeur." >&2
  set -- "$@" WEB_SESSION_SECRET="$(head -c 32 /dev/urandom | base64 | tr -d '/+=')"
elif [ -n "${WEB_SESSION_SECRET:-}" ]; then
  set -- "$@" WEB_SESSION_SECRET="$WEB_SESSION_SECRET"
elif ! flyctl secrets list --json -a "$APP" 2>/dev/null | grep -q '"name": *"WEB_SESSION_SECRET"'; then
  echo "WEB_SESSION_SECRET absent : j'en tire un au hasard pour l'espace de modération."
  set -- "$@" WEB_SESSION_SECRET="$(head -c 32 /dev/urandom | base64 | tr -d '/+=')"
fi
# --stage : posés maintenant, appliqués par le déploiement qui suit, sans redémarrage inutile
flyctl secrets set --stage -a "$APP" "$@"

echo "== Secrets distincts =="
# Le serveur refuse déjà de démarrer quand deux secrets portent la même valeur (server/secrets.js),
# mais il ne peut le faire que sur la machine neuve, une fois l'ancienne remplacée : son seul refus
# possible est de tomber. Le 14 septembre 2026, ça s'est traduit par dix redémarrages et une
# production éteinte. Ici, le même fait n'arrête qu'un déploiement.
#
# Lu APRÈS la pose des secrets, pour juger les valeurs que la machine recevra et non celles
# qu'elle quitte. Si l'hébergeur n'affichait pas encore les empreintes fraîches, le contrôle
# refuserait un déploiement qui corrige justement le partage : un déploiement à relancer, jamais
# une production éteinte. C'est le sens dans lequel on préfère se tromper.
command -v node >/dev/null 2>&1 || { echo "node introuvable : le contrôle des secrets ne peut pas tourner." >&2; exit 1; }
# --json : la forme sûre. Le texte de flyctl a changé trois fois de lecture (espaces, marqueur
# « * », trait « │ ») avant qu'on ne lise ce que la machine sait produire sans ambiguïté.
flyctl secrets list --json -a "$APP" | node scripts/verifier-secrets.js

echo "== Déploiement =="
# --remote-only : l'image est construite chez Fly, aucun Docker local nécessaire
flyctl deploy --remote-only -a "$APP"

echo "== Contrôle =="
URL="https://$APP.fly.dev"
for _ in $(seq 1 20); do
  if curl -fsS --max-time 10 "$URL/health" | grep -q '"ok":true'; then
    echo "Mini app joignable sur $URL"
    if [ "$IP_NEUVE" = 1 ]; then
      echo "Adresse publique toute neuve : Telegram met parfois une quinzaine de"
      echo "minutes à la résoudre. Tant que le journal affiche « setWebhook failed »,"
      echo "attends, puis relance : flyctl apps restart $APP"
    fi
    exit 0
  fi
  sleep 3
done
echo "Déployé, mais $URL/health n'a pas répondu. Journal : flyctl logs -a $APP" >&2
exit 1
