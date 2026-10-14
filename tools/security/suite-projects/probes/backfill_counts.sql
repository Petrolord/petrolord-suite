-- backfill counts per table (as the migration role, after the three migrations)
do $$
declare t text; tot bigint; st bigint; nul bigint;
begin
  foreach t in array array['geo_wells','geo_surfaces','geo_culture','geo_correlation_sections','geo_strat_units',
                           'strat_projects','seismic_projects','seismic_volumes','seismic_lines'] loop
    execute format('select count(*), count(suite_project_id), count(*) - count(suite_project_id) from public.%I', t) into tot, st, nul;
    insert into _p values ('backfill', 'counts', t,
      case when tot = st then 'PASS ' else 'FAIL ' end || 'rows=' || tot || ' stamped=' || st || ' null=' || nul);
  end loop;
end $$;
insert into _p
select 'backfill', 'projects', coalesce(o.name, 'personal: ' || u.email) || ' / ' || p.name,
       'default=' || p.is_default || ' visibility=' || p.visibility || ' owner=' || coalesce(ou.email, '-')
       || ' wells=' || (select count(*) from public.geo_wells w where w.suite_project_id = p.id)
       || ' surfaces=' || (select count(*) from public.geo_surfaces w where w.suite_project_id = p.id)
       || ' sections=' || (select count(*) from public.geo_correlation_sections w where w.suite_project_id = p.id)
       || ' seis_projects=' || (select count(*) from public.seismic_projects w where w.suite_project_id = p.id)
       || ' volumes=' || (select count(*) from public.seismic_volumes w where w.suite_project_id = p.id)
       || ' lines=' || (select count(*) from public.seismic_lines w where w.suite_project_id = p.id)
       || ' members=' || (select count(*) from public.suite_project_members m where m.project_id = p.id)
  from public.suite_projects p
  left join public.organizations o on o.id = p.organization_id
  left join auth.users u on u.id = p.owner_user_id
  left join auth.users ou on ou.id = p.owner_user_id;
-- every row in its creator's default: the row's org default, else the creator's org default, else personal
insert into _p
select 'backfill', 'rule', 'geo_wells creator rule',
       case when count(*) filter (where p.id is null) = 0 then 'PASS ' else 'FAIL ' end || count(*) filter (where p.id is null) || ' wells off-rule'
  from public.geo_wells w
  left join public.suite_projects p on p.id = w.suite_project_id and p.is_default
   and ((p.organization_id = public.suite_org_of(w.user_id)) or (p.organization_id is null and p.owner_user_id = w.user_id and public.suite_org_of(w.user_id) is null));
