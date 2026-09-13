-- Compteurs de limitation de débit, partagés entre instances.
--
-- Ils vivaient en mémoire, ce qui était correct tant qu'une seule machine tournait. Le passage à
-- PostgreSQL a levé cette contrainte sans que les compteurs suivent : à deux machines, chaque
-- garde-fou anti-spam valait le double dans les faits — 40 messages par minute au lieu de 20 —
-- puisque chaque machine tenait son propre compte sans voir celui de l'autre.
--
-- Une ligne par (action, compte). `horodatages` porte la fenêtre glissante : les dates des
-- actions encore comptées, les plus anciennes retirées à chaque passage. C'est la même structure
-- qu'en mémoire, posée là où toutes les instances la lisent.
--
-- `fin` est la date après laquelle la ligne ne dit plus rien (dernière action + fenêtre). Elle ne
-- sert qu'à la purge : sans elle, la table grossirait d'une ligne par compte et par action, pour
-- toujours.
create table if not exists rate_limits (
  cle         text     primary key,
  horodatages bigint[] not null,
  fin         bigint   not null
);

-- Purger ce qui a expiré : la requête est fin < maintenant.
create index if not exists rate_limits_fin_idx on rate_limits (fin);
