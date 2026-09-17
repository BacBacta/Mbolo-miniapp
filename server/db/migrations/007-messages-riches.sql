-- Ce qu'un message peut porter en plus de son texte, depuis le 17 septembre 2026.
--
-- `reply_to`   : l'identifiant du message auquel celui-ci répond, dans la même discussion.
-- `photo`      : vrai quand le message est une image (le fichier vit sur le volume,
--                `chat-<match>-<message>.jpg`, et son aperçu à côté), le texte est alors la
--                légende, souvent vide.
-- `deleted_at` : posé quand l'auteur retire son message. La ligne reste : les deux écrans
--                montrent « Message supprimé », et la modération peut encore lire le texte si
--                la discussion est signalée — sans quoi une demande d'argent effacée avant le
--                signalement n'aurait jamais existé. Tout part avec le match, comme avant.
alter table messages add column if not exists reply_to   text;
alter table messages add column if not exists photo      boolean not null default false;
alter table messages add column if not exists deleted_at bigint;
