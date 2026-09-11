#!/data/data/com.termux/files/usr/bin/bash
# Raccourci : force le tunnel pinggy (SSH sur le port 443), le plus susceptible de
# passer sur un réseau qui filtre. Le tunnel gratuit expire au bout de 60 minutes.
cd "$(dirname "$0")"
exec ./demarrer.sh pinggy
