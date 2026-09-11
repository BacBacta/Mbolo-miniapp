#!/data/data/com.termux/files/usr/bin/bash
# Monte un tunnel HTTPS vers le port 3000 et écrit son adresse dans .env (WEBAPP_URL).
#
# Usage : ./tunnel.sh [auto|cloudflared|ssh]
#   auto (défaut) : essaie cloudflared, bascule sur localhost.run s'il est injoignable
#
# Sort 0 si un tunnel joignable est actif, 1 sinon.

cd "$(dirname "$0")"
MODE="${1:-auto}"
LOG_CF="$HOME/.cf-tunnel.log"
LOG_SSH="$HOME/.ssh-tunnel.log"
URL_TROUVEE=""

if [ ! -f .env ]; then
  echo "Fichier .env absent. Fais : cp .env.example .env, puis colle ton BOT_TOKEN dedans."
  exit 1
fi

case "$MODE" in
  auto)        ORDRE="cloudflared ssh" ;;
  cloudflared) ORDRE="cloudflared" ;;
  ssh)         ORDRE="ssh" ;;
  *) echo "Usage : ./tunnel.sh [auto|cloudflared|ssh]"; exit 1 ;;
esac

ecrire_url() {
  if grep -q '^WEBAPP_URL=' .env; then
    sed -i "s#^WEBAPP_URL=.*#WEBAPP_URL=$1#" .env
  else
    echo "WEBAPP_URL=$1" >> .env
  fi
}

arreter_tunnels() {
  pkill cloudflared 2>/dev/null
  pkill -f "nokey@localhost.run" 2>/dev/null
}

# Ce contrôle dit seulement si l'adresse répond, pas si la mini app est servie.
# Tant que le serveur n'est pas démarré, l'edge du tunnel renvoie normalement une
# erreur 502 ou 503 : c'est attendu, ce n'est pas un échec.
# Deux codes sont disqualifiants :
#   000 : le nom ne résout pas, ou ton réseau bloque le service ;
#   530 : l'edge répond, mais plus aucun tunnel n'est branché derrière, parce que le
#         processus est tombé (c'est l'erreur 1033 côté Cloudflare). L'utilisateur
#         verrait cette page d'erreur à la place de la mini app : adresse écartée.
# Plusieurs essais, car l'adresse d'un tunnel qui vient d'être créé met parfois
# quelques secondes à se propager.
# Le vrai verdict, lui, est rendu par demarrer.sh une fois le serveur lancé.
code_tunnel() {
  local code
  for _ in 1 2 3 4; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$1/health" 2>/dev/null)
    [ "$code" != "000" ] && break
    sleep 2
  done
  echo "$code"
}

monter_cloudflared() {
  if ! command -v cloudflared >/dev/null 2>&1; then
    echo "cloudflared n'est pas installé. Pour l'ajouter : pkg install cloudflared"
    return 1
  fi
  pkill cloudflared 2>/dev/null
  rm -f "$LOG_CF"
  nohup cloudflared tunnel --url http://localhost:3000 > "$LOG_CF" 2>&1 &
  echo "cloudflared : attente de l'adresse…"
  for _ in $(seq 1 40); do
    sleep 1
    URL_TROUVEE=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG_CF" 2>/dev/null | grep -v api | head -1)
    [ -n "$URL_TROUVEE" ] && return 0
  done
  echo "cloudflared : adresse introuvable. Fin du journal :"
  tail -8 "$LOG_CF"
  pkill cloudflared 2>/dev/null
  return 1
}

monter_ssh() {
  if ! command -v ssh >/dev/null 2>&1; then
    echo "ssh n'est pas installé. Pour l'ajouter : pkg install openssh"
    return 1
  fi
  pkill -f "nokey@localhost.run" 2>/dev/null
  rm -f "$LOG_SSH"
  nohup ssh -T -n -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:localhost:3000 nokey@localhost.run > "$LOG_SSH" 2>&1 &
  echo "localhost.run : connexion…"
  for _ in $(seq 1 30); do
    sleep 1
    URL_TROUVEE=$(grep -oE 'https://[a-z0-9]+\.lhr\.life' "$LOG_SSH" 2>/dev/null | tail -1)
    [ -n "$URL_TROUVEE" ] && return 0
  done
  echo "localhost.run : adresse introuvable. Fin du journal :"
  tail -8 "$LOG_SSH"
  pkill -f "nokey@localhost.run" 2>/dev/null
  return 1
}

for type in $ORDRE; do
  URL_TROUVEE=""
  monte=1
  case "$type" in
    cloudflared) monter_cloudflared && monte=0 ;;
    ssh)         monter_ssh && monte=0 ;;
  esac
  [ "$monte" = 0 ] || continue

  case "$(code_tunnel "$URL_TROUVEE")" in
    000)
      echo "$URL_TROUVEE ne répond pas depuis ce téléphone : ton réseau bloque ce service."
      arreter_tunnels
      continue
      ;;
    530)
      echo "$URL_TROUVEE répond, mais aucun tunnel n'est branché derrière (code 530)."
      echo "C'est la page d'erreur que verrait l'utilisateur à la place de la mini app."
      arreter_tunnels
      continue
      ;;
    200)
      ecrire_url "$URL_TROUVEE"
      echo "Tunnel actif, mini app déjà joignable : $URL_TROUVEE"
      exit 0
      ;;
    *)
      ecrire_url "$URL_TROUVEE"
      echo "Tunnel monté : $URL_TROUVEE"
      echo "L'adresse répond, mais rien n'est encore servi derrière : c'est normal tant que le serveur n'est pas lancé."
      exit 0
      ;;
  esac
done

echo "Aucun tunnel joignable. Change de réseau (Wi-Fi ou données mobiles) et réessaie."
exit 1
