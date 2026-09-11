#!/data/data/com.termux/files/usr/bin/bash
cd "$(dirname "$0")"
termux-wake-lock 2>/dev/null
pkill -f "node server/index.js" 2>/dev/null
./tunnel.sh || exit 1
URL=$(grep '^WEBAPP_URL=' .env | cut -d= -f2)
echo "Vérification que l'adresse est joignable…"
for i in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$URL/health")
  [ "$CODE" != "000" ] && break
  sleep 3
done
if [ "$CODE" = "000" ]; then
  echo "L'adresse ne répond toujours pas. Change de réseau (Wi-Fi ou données) et relance."
  exit 1
fi
echo "Adresse joignable. Démarrage du serveur…"
npm start

