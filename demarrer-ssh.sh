#!/data/data/com.termux/files/usr/bin/bash
# Raccourci : force le tunnel localhost.run, utile quand le réseau bloque cloudflared.
cd "$(dirname "$0")"
exec ./demarrer.sh ssh
