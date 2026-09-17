-- Les paiements du pass Odo Plus, reçus en Telegram Stars.
--
-- Une ligne par paiement reçu, jamais modifiée sauf pour porter un remboursement. C'est la
-- pièce comptable : ce que Telegram a versé, quand, pour combien de jours, et la référence
-- (`charge_id`, le telegram_payment_charge_id) qui permet de rembourser et de répondre à une
-- réclamation. Le droit lui-même reste dans users.data->'plus' (estPlus() en est le seul lecteur) :
-- la table dit ce qui a été payé, le compte dit ce qui est ouvert.
--
-- `charge_id` est unique : Telegram peut livrer deux fois le même paiement (webhook rejoué), et
-- la seconde livraison ne doit ni créditer deux fois, ni faire tomber la première.
--
-- `user_id` se vide à la suppression du compte (droit à l'effacement) : la ligne reste, sans
-- personne derrière, parce qu'un paiement encaissé se garde comme une facture.
create table if not exists paiements (
  id           text   primary key,
  user_id      text,
  charge_id    text   not null unique,
  source       text   not null,
  jours        int    not null,
  stars        int    not null,
  statut       text   not null,
  at           bigint not null,
  rembourse_le bigint
);

create index if not exists paiements_user_idx on paiements (user_id, at desc);
