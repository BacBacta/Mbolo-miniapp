#!/data/data/com.termux/files/usr/bin/bash
cd "$(dirname "$0")"
LOG="$HOME/.ssh-tunnel.log"
termux-wake-lock 2>/dev/null
pkill -f "localhost.run" 2>/dev/null
pkill cloudflared 2>/dev/null
pkill -f "node server/index.js" 2>/dev/null
sleep 1
rm -f "$LOG"
nohup ssh -T -n -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:localhost:3000 nokey@localhost.run > "$LOG" 2>&1 &
echo "Connexion du tunnel…"
URL=""
for i in $(seq 1 30); do
  sleep 1
  URL=$(grep -oE 'https://[a-z0-9]+\.lhr\.life' "$LOG" | tail -1)
  [ -n "$URL" ] && break
done
if [ -z "$URL" ]; then
  echo "Adresse introuvable. Journal :"
  tail -15 "$LOG"
  exit 1
fi
sed -i "s#^WEBAPP_URL=.*#WEBAPP_URL=$URL#" .env
echo "Tunnel actif : $URL"
echo "Démarrage du serveur… Renvoie ensuite /start au bot."
npm start
