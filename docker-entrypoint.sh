#!/bin/sh
# Un volume fraîchement créé appartient à root. On le prépare, puis on abandonne
# les droits : le serveur ne tourne jamais en root.
set -e
mkdir -p "$DATA_DIR/uploads"
chown -R node:node "$DATA_DIR"
exec su-exec node "$@"
