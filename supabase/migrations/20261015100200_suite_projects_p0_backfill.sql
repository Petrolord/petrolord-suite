-- Suite Projects P0, part 3 of 3: the backfill.
-- Needs 20261015100000 and 20261015100100.
--
-- 1. One Default project per organisation (open to the organisation; owner the
--    organisation's earliest active owner, who also becomes its owner member).
-- 2. One personal Default project for every user who owns registry rows and has
--    no active organisation membership.
-- 3. Every registry row with a null suite_project_id goes to a default project,
--    deterministically:
--      the row's own organisation's default, when the row is shared with an organisation;
--      else the creator's organisation default (the same rule as my_org_id());
--      else the creator's personal default.
--    Nothing is renamed, moved between users or deleted. All defaults are open
--    to the organisation, so the RESTRICTIVE policies pass every row and nobody's
--    access changes.
-- 4. Settings stay '{}' (reserved for P2). suite_user_state stays empty: no
--    current project means the default project.
--
-- The sharing triggers (suite_record_guard / suite_record_log) on geo_wells,
-- geo_correlation_sections and seismic_projects are disabled around the stamp,
-- so the backfill neither bumps record versions nor writes change-log rows; they
-- are re-enabled in the same transaction.
--
-- The file ends with a check that raises (and so rolls the whole file back) if
-- any registry row is left without a project.
--
-- Idempotent (a second run creates nothing and stamps nothing); no transaction
-- lines. Rollback: tools/security/suite-projects/rollback/20261015100200.rollback.sql

-- 1. organisation defaults
insert into public.suite_projects (organization_id, owner_user_id, name, is_default, visibility, created_by)
select o.id,
       (select om.user_id from public.organization_members om
         where om.organization_id = o.id and om.role = 'owner' and coalesce(lower(om.status), 'active') = 'active'
         order by om.joined_at nulls last, om.created_at limit 1),
       'Default', true, 'organisation', null
  from public.organizations o
 where not exists (select 1 from public.suite_projects p where p.organization_id = o.id and p.is_default)
 order by o.created_at, o.id;

-- 2. personal defaults for row owners without an organisation
with owners as (
    select user_id from public.geo_wells union
    select user_id from public.geo_surfaces union
    select user_id from public.geo_culture union
    select user_id from public.geo_correlation_sections union
    select user_id from public.geo_strat_units union
    select user_id from public.strat_projects union
    select user_id from public.seismic_projects union
    select user_id from public.seismic_volumes union
    select user_id from public.seismic_lines
)
insert into public.suite_projects (organization_id, owner_user_id, name, is_default, visibility, created_by)
select null, w.user_id, 'Default', true, 'organisation', null
  from owners w
 where w.user_id is not null
   and public.suite_org_of(w.user_id) is null
   and exists (select 1 from auth.users u where u.id = w.user_id)
   and not exists (select 1 from public.suite_projects p
                    where p.organization_id is null and p.owner_user_id = w.user_id and p.is_default)
 order by w.user_id;

-- 3. stamp every registry row
create or replace function pg_temp.suite_backfill_target(p_user uuid, p_row_org uuid)
returns uuid language sql stable as $$
    select coalesce(
        (select p.id from public.suite_projects p where p.is_default and p_row_org is not null and p.organization_id = p_row_org),
        (select p.id from public.suite_projects p where p.is_default and p.organization_id = public.suite_org_of(p_user)),
        (select p.id from public.suite_projects p where p.is_default and p.organization_id is null and p.owner_user_id = p_user));
$$;

alter table public.geo_wells disable trigger suite_record_guard;
alter table public.geo_wells disable trigger suite_record_log;
alter table public.geo_correlation_sections disable trigger suite_record_guard;
alter table public.geo_correlation_sections disable trigger suite_record_log;
alter table public.seismic_projects disable trigger suite_record_guard;
alter table public.seismic_projects disable trigger suite_record_log;

update public.geo_wells                t set suite_project_id = pg_temp.suite_backfill_target(t.user_id, t.organization_id) where t.suite_project_id is null;
update public.geo_surfaces             t set suite_project_id = pg_temp.suite_backfill_target(t.user_id, t.organization_id) where t.suite_project_id is null;
update public.geo_culture              t set suite_project_id = pg_temp.suite_backfill_target(t.user_id, t.organization_id) where t.suite_project_id is null;
update public.geo_correlation_sections t set suite_project_id = pg_temp.suite_backfill_target(t.user_id, t.organization_id) where t.suite_project_id is null;
update public.geo_strat_units          t set suite_project_id = pg_temp.suite_backfill_target(t.user_id, t.organization_id) where t.suite_project_id is null;
update public.strat_projects           t set suite_project_id = pg_temp.suite_backfill_target(t.user_id, null)              where t.suite_project_id is null;
update public.seismic_projects         t set suite_project_id = pg_temp.suite_backfill_target(t.user_id, t.organization_id) where t.suite_project_id is null;
update public.seismic_volumes          t set suite_project_id = pg_temp.suite_backfill_target(t.user_id, t.organization_id) where t.suite_project_id is null;
update public.seismic_lines            t set suite_project_id = pg_temp.suite_backfill_target(t.user_id, t.organization_id) where t.suite_project_id is null;

alter table public.geo_wells enable trigger suite_record_guard;
alter table public.geo_wells enable trigger suite_record_log;
alter table public.geo_correlation_sections enable trigger suite_record_guard;
alter table public.geo_correlation_sections enable trigger suite_record_log;
alter table public.seismic_projects enable trigger suite_record_guard;
alter table public.seismic_projects enable trigger suite_record_log;

-- 4. nothing left behind
do $$
declare t text; n bigint; total bigint := 0;
begin
    foreach t in array array['geo_wells', 'geo_surfaces', 'geo_culture', 'geo_correlation_sections', 'geo_strat_units',
                             'strat_projects', 'seismic_projects', 'seismic_volumes', 'seismic_lines'] loop
        execute format('select count(*) from public.%I where suite_project_id is null', t) into n;
        if n > 0 then
            raise notice 'suite projects backfill: % rows of % have no project', n, t;
            total := total + n;
        end if;
    end loop;
    if total > 0 then
        raise exception 'Suite projects backfill left % rows without a project; nothing applied.', total;
    end if;
end $$;
