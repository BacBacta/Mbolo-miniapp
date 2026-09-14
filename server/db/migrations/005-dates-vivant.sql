-- Un seul rendez-vous vivant (proposé ou accepté) par discussion. La route le vérifiait avant
-- d'insérer : deux propositions simultanées passaient toutes les deux, et le check-in ne savait
-- plus lequel. Les doublons déjà présents sont annulés d'abord — le plus récent reste —, sinon
-- l'index ne pourrait pas se créer.
update dates set data = data || '{"status":"cancelled"}'::jsonb
where id in (
  select id from (
    select id, row_number() over (partition by match_id order by (data->>'createdAt')::bigint desc) as rang
    from dates where data->>'status' in ('proposed', 'accepted')
  ) x where rang > 1
);
create unique index if not exists dates_vivant on dates (match_id) where data->>'status' in ('proposed', 'accepted');
