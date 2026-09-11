#!/data/data/com.termux/files/usr/bin/bash
# Lance le tunnel puis le serveur, et garde le serveur au premier plan.
#
# Usage : ./demarrer.sh [auto|cloudflared|ssh]
#
# Le serveur démarre même sans tunnel : le bot répond à /start par l'interrogation
# longue, qui sort vers Telegram et n'a besoin d'aucune adresse entrante. Le tunnel
# ne sert qu'à afficher la mini app.

cd "$(dirname "$0")"
MODE="${1:-auto}"
VERIF_PID=""

# Quoi proposer quand ça coince : l'autre tunnel que celui qu'on vient d'essayer.
if [ "$MODE" = ssh ]; then CONSEIL="./demarrer.sh cloudflared"; else CONSEIL="./demarrer.sh ssh"; fi

if [ ! -f .env ]; then
  echo "Fichier .env absent. Fais : cp .env.example .env, puis colle ton BOT_TOKEN dedans."
  exit 1
fi

termux-wake-lock 2>/dev/null
pkill -f "node server/index.js" 2>/dev/null

# Les tunnels ne survivent pas à l'arrêt du serveur : sinon ils laissent croire que
# tout tourne alors que plus rien n'est servi derrière.
nettoyer() {
  [ -n "$VERIF_PID" ] && kill "$VERIF_PID" 2>/dev/null
  pkill cloudflared 2>/dev/null
  pkill -f "nokey@localhost.run" 2>/dev/null
}
trap nettoyer EXIT INT TERM

if ./tunnel.sh "$MODE"; then
  URL=$(grep '^WEBAPP_URL=' .env | head -1 | sed 's/^WEBAPP_URL=//' | tr -d '\r')
  # Contrôle de bout en bout : le serveur tourne au premier plan, donc en tâche de fond.
  (
    for _ in $(seq 1 20); do
      sleep 2
      if curl -s --max-time 5 "$URL/health" | grep -q '"ok":true'; then
        echo "--- Mini app joignable sur $URL ---"
        exit 0
      fi
    done
    echo "--- $URL ne sert toujours pas la mini app. Arrête avec Ctrl-C, puis essaie $CONSEIL ---"
  ) &
  VERIF_PID=$!
else
  echo
  echo "Le serveur démarre quand même : le bot répondra à /start."
  echo "Le bouton Ouvrir, lui, pointera encore sur l'adresse précédente, qui ne répond plus."
  echo "Pour réessayer un tunnel : Ctrl-C, puis $CONSEIL"
  echo
fi

npm start
