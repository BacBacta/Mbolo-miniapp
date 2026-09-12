-- Événements de mesure produit. Voir audit/05-mesure-produit.md pour ce qui a le droit d'y entrer.
--
-- Aucun texte : ni message, ni prénom, ni quartier, ni champ de profil. Uniquement un identifiant
-- déjà stocké, un nom d'événement, une date, et une charge utile de nombres ou de mots-clés fermés.
--
-- u est nullable, pour une seule raison : account_deleted survit à la suppression du compte, sans
-- identifiant. C'est ce qui rend un départ mesurable sans permettre de remonter à la personne.
create table if not exists events (
  id text   primary key,
  u  text,
  k  text   not null,
  at bigint not null,
  p  jsonb
);

-- Purger les événements d'une personne qui s'efface : la requête est u = $1.
create index if not exists events_u_idx on events (u) where u is not null;
-- Purger ce qui a dépassé la durée de conservation, et lire une période : la requête est at.
create index if not exists events_at_idx on events (at);
-- Compter un type d'événement sur une période : l'entonnoir ne fait que ça.
create index if not exists events_k_at_idx on events (k, at);
