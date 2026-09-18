-- Les réactions sur un message (audit/15, lot 4), depuis le 18 septembre 2026.
--
-- `reactions` : par membre de la discussion, l'emoji qu'il a posé sur ce message, parmi une
--               liste fermée de six (REACTIONS dans routes.js). Un membre, une réaction au plus.
-- `reagi_at`  : la dernière fois qu'une réaction a bougé sur ce message, pour que l'interrogation
--               (`after`) puisse rattraper une réaction posée sur un vieux message.
-- Jamais notifiées : c'est le geste qui fait vivre un fil sans écrire, pas une alerte de plus.
alter table messages add column if not exists reactions jsonb not null default '{}'::jsonb;
alter table messages add column if not exists reagi_at  bigint;
