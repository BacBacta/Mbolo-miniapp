#!/data/data/com.termux/files/usr/bin/bash
cd "$(dirname "$0")"
LOG="$HOME/.cf-tunnel.log"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared n'est pas installé. Lance : pkg install cloudflared"
  exit 1
fi

pkill cloudflared 2>/dev/null
rm -f "$LOG"
nohup cloudflared tunnel --url http://localhost:3000 > "$LOG" 2>&1 &
echo "Attente de l'adresse du tunnel…"

URL=""
for i in $(seq 1 40); do
  sleep 1
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" 2>/dev/null | grep -v api | head -1)
  [ -n "$URL" ] && break
done

if [ -z "$URL" ]; then
  echo "Adresse introuvable. Fin du journal :"
  tail -15 "$LOG"
  exit 1
fi

if grep -q '^WEBAPP_URL=' .env; then
  sed -i "s#^WEBAPP_URL=.*#WEBAPP_URL=$URL#" .env
else
  echo "WEBAPP_URL=$URL" >> .env
fi
echo "Tunnel actif : $URL"
