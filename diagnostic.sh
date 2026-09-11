#!/data/data/com.termux/files/usr/bin/bash
# Fait le tour de ce qui peut empêcher le bot de répondre ou la mini app de s'ouvrir.
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Fichier .env absent. Fais : cp .env.example .env, puis colle ton BOT_TOKEN dedans."
  exit 1
fi

lire_env() { grep "^$1=" .env | head -1 | sed "s/^$1=//" | tr -d '\r"'; }
TOKEN=$(lire_env BOT_TOKEN | tr -d ' ')
URL=$(lire_env WEBAPP_URL)
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
echo "${URL:-(vide)}"

echo "== 6. Serveur local, port 3000 =="
if curl -s --max-time 5 http://localhost:3000/health | grep -q '"ok":true'; then
  echo "En marche"
else
  echo "ARRÊTÉ : sans lui le bot ne peut pas répondre à /start. Lance ./demarrer.sh"
fi

echo "== 7. Adresse publique joignable depuis Termux =="
if [ -z "$URL" ]; then
  echo "WEBAPP_URL est vide : la mini app ne peut pas s'ouvrir. Lance ./demarrer.sh"
else
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$URL/health")
  case "$CODE" in
    200)     echo "Code 200 : tout va bien" ;;
    000)     echo "Code 000 : injoignable. Tunnel tombé, ou ton réseau bloque ce service. Essaie ./demarrer.sh ssh" ;;
    50[0-9]) echo "Code $CODE : le tunnel répond, mais rien ne tourne derrière. Lance ./demarrer.sh" ;;
    *)       echo "Code $CODE" ;;
  esac
fi

echo "== 8. Processus =="
# Un tunnel « en cours » ne prouve pas qu'il fonctionne : le verdict est à l'étape 7.
pgrep -f cloudflared >/dev/null && echo "cloudflared : en cours" || echo "cloudflared : arrêté"
pgrep -f "nokey@localhost.run" >/dev/null && echo "localhost.run : en cours" || echo "localhost.run : arrêté"
# Motif volontairement strict : « server/index.js » seul matcherait aussi un
# éditeur ouvert sur le fichier.
N=$(pgrep -f "node .*server/index\.js" | wc -l)
case "$N" in
  0) echo "Serveur : arrêté" ;;
  1) echo "Serveur : en cours" ;;
  *) echo "Serveur : $N instances. Telegram n'en sert qu'une, les autres reçoivent une erreur 409."
     echo "          Fais : pkill -f \"node server/index.js\" puis ./demarrer.sh" ;;
esac
