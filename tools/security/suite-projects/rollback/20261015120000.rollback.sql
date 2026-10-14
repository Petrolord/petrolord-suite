-- Rollback of 20261015120000_geo_wells_name_unique_per_project.sql.
-- Restores the per-user rule. It refuses (raises, nothing changes) while one
-- owner has the same well name in two projects; rename one of each pair first:
--   select user_id, lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) k, count(*)
--     from public.geo_wells group by 1, 2 having count(*) > 1;
-- No transaction lines.
do $$
begin
    if exists (select 1 from public.geo_wells
                group by user_id, lower(btrim(regexp_replace(name, '\s+'::text, ' '::text, 'g'::text)))
               having count(*) > 1) then
        raise exception 'Some owners have the same well name in two projects; rename them before rolling back.';
    end if;
end $$;
create unique index if not exists geo_wells_owner_name_uniq on public.geo_wells
    (user_id, lower(btrim(regexp_replace(name, '\s+'::text, ' '::text, 'g'::text))));
drop index if exists public.geo_wells_owner_project_name_uniq;
