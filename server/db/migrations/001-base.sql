-- Schéma initial. Il reprend exactement les collections du fichier JSON, avec deux principes :
--
--   * ce qui se filtre ou se joint devient une colonne, indexée ;
--   * ce qui change avec le produit (le profil, les arrivées à un rendez-vous, les horodatages
--     de lecture) reste en jsonb, pour qu'ajouter un champ au profil ne demande pas de migration.
--
-- Les horodatages sont des bigint en millisecondes, comme Date.now() : le reste de l'app les
-- manipule ainsi, et les convertir en timestamptz ici obligerait à reconvertir partout.

create table if not exists users (
  id         text primary key,
  data       jsonb  not null,
  created_at bigint not null
);

-- Un seul balayage par couple de personnes : un « Passer » qui devient « J'aime » réutilise la
-- ligne. La clé primaire composite fait tenir cette règle par la base, plus par le code.
create table if not exists swipes (
  from_id text   not null,
  to_id   text   not null,
  action  text   not null,
  at      bigint not null,
  primary key (from_id, to_id)
);
create index if not exists swipes_to on swipes (to_id);
create index if not exists swipes_from_at on swipes (from_id, at);

-- pair_key est la paire triée « a:b » : elle rend impossible un second match entre deux personnes.
create table if not exists matches (
  id         text   primary key,
  pair_key   text   not null unique,
  user_a     text   not null,
  user_b     text   not null,
  created_at bigint not null,
  read_at    jsonb  not null default '{}'::jsonb
);
create index if not exists matches_user_a on matches (user_a);
create index if not exists matches_user_b on matches (user_b);

create table if not exists messages (
  id       text   primary key,
  match_id text   not null,
  from_id  text   not null,
  text     text   not null,
  at       bigint not null
);
create index if not exists messages_match_at on messages (match_id, at);

create table if not exists blocks (
  from_id text   not null,
  to_id   text   not null,
  at      bigint not null,
  primary key (from_id, to_id)
);
create index if not exists blocks_to on blocks (to_id);

create table if not exists reports (
  id   text   primary key,
  data jsonb  not null,
  at   bigint not null
);

create table if not exists dates (
  id       text  primary key,
  match_id text  not null,
  data     jsonb not null
);
create index if not exists dates_match on dates (match_id);
