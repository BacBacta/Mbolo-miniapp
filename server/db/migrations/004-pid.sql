-- L'identifiant public d'un membre (data->>'pid') : ce que les autres voient et renvoient, sans
-- lien avec l'identifiant Telegram. Résolu à chaque like, chaque photo, chaque voix : un index.
create index if not exists users_pid on users ((data->>'pid'));
