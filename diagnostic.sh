#!/data/data/com.termux/files/usr/bin/bash
cd "$(dirname "$0")"
TOKEN=$(grep '^BOT_TOKEN=' .env | cut -d= -f2 | tr -d '\r" ')
API="https://api.telegram.org/bot$TOKEN"
echo "== 1. Jeton dans .env =="
if printf '%s' "$TOKEN" | grep -qE '^[0-9]{6,}:[A-Za-z0-9_-]{30,}$'; then echo "Format OK (${#TOKEN} caractères)"; else echo "Format INVALIDE (${#TOKEN} caractères)"; fi
echo "== 2. Telegram reconnaît le bot =="
curl -s --max-time 10 "$API/getMe" | grep -oE '"ok":[a-z]+|"username":"[^"]*"|"description":"[^"]*"' || echo "Pas de réponse de Telegram"
echo "== 3. Adresse du bouton Ouvrir chez Telegram =="
curl -s --max-time 10 "$API/getChatMenuButton" | grep -oE '"type":"[^"]*"|"url":"[^"]*"'
echo "== 4. Webhook =="
curl -s --max-time 10 "$API/getWebhookInfo" | grep -q '"url":"http' && echo "Un webhook est configuré" || echo "Aucun webhook"
echo "== 5. Adresse dans .env =="
URL=$(grep '^WEBAPP_URL=' .env | cut -d= -f2 | tr -d '\r')
echo "$URL"
echo "== 6. Adresse joignable depuis Termux =="
curl -s -o /dev/null -w "Code %{http_code}\n" --max-time 10 "$URL/health"
echo "== 7. Processus =="
pgrep -f cloudflared >/dev/null && echo "Tunnel : en cours" || echo "Tunnel : arrêté"
pgrep -f "server/index.js" >/dev/null && echo "Serveur : en cours" || echo "Serveur : arrêté"
