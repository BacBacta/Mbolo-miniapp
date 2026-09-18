-- « J'aime » sur une réponse (audit/15, lot 2), depuis le 18 septembre 2026.
--
-- `sur` : la clé de la question de la fiche que le « J'aime » vise (promptQ ou une question
--         supplémentaire), parmi la liste fermée de config.js. Absente quand le « J'aime » vise la
--         personne entière, comme avant.
-- `mot` : le mot qui l'accompagne, 60 caractères au plus, passé par l'anti-arnaque comme un
--         message. Il n'est montré à personne tant que le « J'aime » n'est pas rendu ; au match,
--         il devient le premier message de la discussion. Il part avec le balayage (« revenir »)
--         et avec le compte, comme le reste de la ligne.
alter table swipes add column if not exists sur text;
alter table swipes add column if not exists mot text;
