-- Wellsite Studio WS0 (docs/scope/WellsiteStudio-PLAN.md section 4,
-- spec sections 10 to 13, 25, 33, 36 to 38, 42). App-private `ws_*`
-- tables: the shared record of a live well.
--
-- DELIBERATE DEPARTURE from the geo_* owner-only rule: a well's record is
-- multi-writer within the organisation (rig and office write the same
-- well), gated by per-well membership (ws_well_members) instead of row
-- ownership. Registry writes (geo_wells_*) still happen only through an
-- explicit Publish step under the owner-only rule; nothing here touches a
-- shared table.
--
-- Append-only: observations, interpretations, events, decisions, samples,
-- stages, tops, photos, reports and sign-offs are never updated or
-- deleted by an authenticated client (no policies, privileges revoked).
-- A correction is a new row citing the old one (supersedes_id); a new
-- version names its previous_version_id; an approver's resolving version
-- lists the competing heads in resolves_ids. The sync engine pushes
-- client-minted UUIDs with `on conflict (id) do nothing`, so a retried
-- batch is harmless, and pulls by the server-assigned server_seq.
--
-- Depth: no bare depths. Every depth carries the five entered attributes
-- (value, unit, reference, datum, kind) plus the canonical md_calc_m
-- (metres MD below KB, the registry convention), the calculated TVD and
-- subsea depth, the survey version and the method; an all-or-none check
-- refuses a partial depth. Time: occurred_at (UTC) plus local_offset_min
-- on every row.
--
-- Idempotent (if not exists / drop policy if exists), staging first.

-- ---- roles ---------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'ws_role') then
    create type public.ws_role as enum (
      'wellsite_geologist', 'senior_wellsite_geologist', 'operations_geologist', 'well_geology_lead', 'administrator');
  end if;
end $$;

-- ---- ws_wells ------------------------------------------------------------

create table if not exists public.ws_wells (
  id uuid primary key default gen_random_uuid(),
  geo_well_id uuid not null unique references public.geo_wells(id) on delete restrict,
  organization_id uuid not null,
  created_by uuid not null default auth.uid(),
  name text not null,
  -- header fields the registry lacks: field, operator, rig, country, spud, gl_elev_m, rt_offset_m, datum notes
  header jsonb not null default '{}'::jsonb,
  -- survey snapshot used for TVD on the rig: { version, method, stations:[{md,inc,azi}], source }
  survey jsonb,
  settings jsonb not null default '{
    "approver_roles": ["well_geology_lead", "administrator"],
    "mandatory_sample_stages": ["caught", "described", "bagged"],
    "rig_offset_min": 0,
    "tour_starts_local": ["06:00", "18:00"],
    "report_day_start_local": "06:00",
    "default_depth": {"unit": "ft", "reference": "MD", "datum": "RT"},
    "keep_originals": false,
    "overdue_tolerance_min": 15
  }'::jsonb,
  status text not null default 'active' check (status in ('planned', 'active', 'suspended', 'complete')),
  schema_version integer not null default 1,
  app_build text,
  engine_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ws_wells_org_idx on public.ws_wells (organization_id);

create table if not exists public.ws_well_members (
  id uuid primary key default gen_random_uuid(),
  well_id uuid not null references public.ws_wells(id) on delete cascade,
  user_id uuid not null,
  role public.ws_role not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  added_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (well_id, user_id)
);
create index if not exists ws_well_members_user_idx on public.ws_well_members (user_id);

-- ---- membership helpers (security definer, stable) ------------------------

create or replace function public.ws_is_member(p_well uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from public.ws_well_members m
       where m.well_id = p_well and m.user_id = auth.uid() and m.status = 'active')
    or exists (
      select 1 from public.ws_wells w
       where w.id = p_well and public.is_org_admin_of(w.organization_id))
    or public.is_super_admin();
$$;

create or replace function public.ws_can_approve(p_well uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from public.ws_well_members m
        join public.ws_wells w on w.id = m.well_id
       where m.well_id = p_well and m.user_id = auth.uid() and m.status = 'active'
         and (w.settings -> 'approver_roles') ? m.role::text)
    or public.is_super_admin();
$$;

create or replace function public.ws_can_admin(p_well uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from public.ws_well_members m
       where m.well_id = p_well and m.user_id = auth.uid() and m.status = 'active'
         and m.role = 'administrator')
    or exists (
      select 1 from public.ws_wells w
       where w.id = p_well and public.is_org_admin_of(w.organization_id))
    or public.is_super_admin();
$$;

-- the creator of a well becomes its first administrator
create or replace function public.ws_wells_bootstrap_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.ws_well_members (well_id, user_id, role, added_by)
  values (new.id, new.created_by, 'administrator', new.created_by)
  on conflict (well_id, user_id) do nothing;
  return new;
end $$;
drop trigger if exists ws_wells_bootstrap_member on public.ws_wells;
create trigger ws_wells_bootstrap_member after insert on public.ws_wells
  for each row execute function public.ws_wells_bootstrap_member();

-- ---- ws_prognosis (append-only versions of the pre-drill snapshot) ---------

create table if not exists public.ws_prognosis (
  id uuid primary key default gen_random_uuid(),
  well_id uuid not null references public.ws_wells(id) on delete cascade,
  version integer not null,
  loaded_at timestamptz not null default now(),
  local_offset_min smallint not null default 0,
  source jsonb not null default '{}'::jsonb,
  tops jsonb not null default '[]'::jsonb,
  offset_tops jsonb not null default '[]'::jsonb,
  casing_points jsonb not null default '[]'::jsonb,
  hole_sections jsonb not null default '[]'::jsonb,
  planned_trajectory jsonb,
  pressure_curves jsonb,
  notes text,
  created_by uuid not null default auth.uid(),
  client_created_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  server_seq bigint generated always as identity,
  device_id uuid,
  schema_version integer not null default 1,
  app_build text,
  engine_version text,
  unique (well_id, version)
);

-- ---- ws_records: observation, interpretation, event, decision, narrative ----

create table if not exists public.ws_records (
  id uuid primary key,
  well_id uuid not null references public.ws_wells(id) on delete cascade,
  kind text not null check (kind in ('observation', 'interpretation', 'event', 'decision', 'narrative')),
  subtype text,
  chain_id uuid not null,
  version_no integer not null default 1 check (version_no >= 1),
  previous_version_id uuid references public.ws_records(id),
  supersedes_id uuid references public.ws_records(id),
  resolves_ids uuid[],
  confidence text check (confidence in ('low', 'medium', 'high')),
  evidence_ids uuid[] not null default '{}',
  sample_id uuid,
  photo_id uuid,
  occurred_at timestamptz not null,
  ended_at timestamptz,
  local_offset_min smallint not null,
  -- depth (top or point)
  depth_value numeric,
  depth_unit text check (depth_unit in ('m', 'ft')),
  depth_ref text check (depth_ref in ('MD', 'TVD', 'TVDSS')),
  depth_datum text check (depth_datum in ('KB', 'RT', 'GL', 'MSL')),
  depth_kind text check (depth_kind in ('bit_depth', 'lagged_sample', 'logged', 'prognosis', 'planned', 'event')),
  md_calc_m numeric,
  tvd_calc_m numeric,
  tvdss_calc_m numeric,
  survey_version text,
  calc_method text check (calc_method in ('minimum_curvature', 'minimum_curvature_extrapolated', 'vertical')),
  -- depth2 (base of an interval, end of a span)
  depth2_value numeric,
  depth2_unit text check (depth2_unit in ('m', 'ft')),
  depth2_ref text check (depth2_ref in ('MD', 'TVD', 'TVDSS')),
  depth2_datum text check (depth2_datum in ('KB', 'RT', 'GL', 'MSL')),
  depth2_kind text check (depth2_kind in ('bit_depth', 'lagged_sample', 'logged', 'prognosis', 'planned', 'event')),
  md2_calc_m numeric,
  tvd2_calc_m numeric,
  tvdss2_calc_m numeric,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid(),
  client_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  server_seq bigint generated always as identity,
  device_id uuid,
  schema_version integer not null default 1,
  app_build text,
  engine_version text,
  constraint ws_records_depth_all_or_none check (
    num_nonnulls(depth_value, depth_unit, depth_ref, depth_datum, depth_kind, md_calc_m, calc_method) in (0, 7)),
  constraint ws_records_depth2_all_or_none check (
    num_nonnulls(depth2_value, depth2_unit, depth2_ref, depth2_datum, depth2_kind, md2_calc_m) in (0, 6)),
  constraint ws_records_depth2_needs_depth check (md2_calc_m is null or md_calc_m is not null),
  constraint ws_records_observation_immutable check (kind <> 'observation' or (previous_version_id is null and version_no = 1)),
  constraint ws_records_interpretation_confidence check (kind <> 'interpretation' or confidence is not null),
  constraint ws_records_decision_fields check (kind <> 'decision' or (payload ? 'basis' and payload ? 'statement')),
  constraint ws_records_span_order check (ended_at is null or ended_at >= occurred_at)
);
create index if not exists ws_records_well_seq_idx on public.ws_records (well_id, server_seq);
create index if not exists ws_records_well_kind_md_idx on public.ws_records (well_id, kind, md_calc_m);
create index if not exists ws_records_well_kind_time_idx on public.ws_records (well_id, kind, occurred_at);
create index if not exists ws_records_chain_idx on public.ws_records (well_id, chain_id);
create index if not exists ws_records_prev_idx on public.ws_records (previous_version_id);
create index if not exists ws_records_sample_idx on public.ws_records (sample_id);

-- ---- ws_samples and stages -------------------------------------------------

create table if not exists public.ws_samples (
  id uuid primary key,
  well_id uuid not null references public.ws_wells(id) on delete cascade,
  sample_no integer not null,
  sample_type text not null default 'cuttings' check (sample_type in ('cuttings', 'core', 'sidewall_core', 'other')),
  hole_section text,
  programme_version integer,
  depth_value numeric not null,
  depth_unit text not null check (depth_unit in ('m', 'ft')),
  depth_ref text not null check (depth_ref in ('MD', 'TVD', 'TVDSS')),
  depth_datum text not null check (depth_datum in ('KB', 'RT', 'GL', 'MSL')),
  depth_kind text not null check (depth_kind in ('bit_depth', 'lagged_sample', 'logged', 'prognosis', 'planned', 'event')),
  md_calc_m numeric not null,
  tvd_calc_m numeric,
  tvdss_calc_m numeric,
  survey_version text,
  calc_method text not null check (calc_method in ('minimum_curvature', 'minimum_curvature_extrapolated', 'vertical')),
  interval_m numeric,
  scheduled_at timestamptz,
  local_offset_min smallint not null,
  created_by uuid not null default auth.uid(),
  client_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  server_seq bigint generated always as identity,
  device_id uuid,
  schema_version integer not null default 1,
  app_build text,
  engine_version text,
  unique (well_id, sample_no)
);
create index if not exists ws_samples_well_md_idx on public.ws_samples (well_id, md_calc_m);
create index if not exists ws_samples_well_seq_idx on public.ws_samples (well_id, server_seq);

create table if not exists public.ws_sample_stages (
  id uuid primary key,
  well_id uuid not null references public.ws_wells(id) on delete cascade,
  sample_id uuid not null references public.ws_samples(id) on delete cascade,
  stage text not null check (stage in ('scheduled', 'due', 'caught', 'washed', 'dried', 'described', 'photographed', 'bagged')),
  at_utc timestamptz not null,
  local_offset_min smallint not null,
  note text,
  created_by uuid not null default auth.uid(),
  client_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  server_seq bigint generated always as identity,
  device_id uuid,
  schema_version integer not null default 1,
  app_build text,
  engine_version text,
  unique (sample_id, stage)
);
create index if not exists ws_sample_stages_well_seq_idx on public.ws_sample_stages (well_id, server_seq);

-- ---- ws_tops: interpretation and official call, versioned --------------------

create table if not exists public.ws_tops (
  id uuid primary key,
  well_id uuid not null references public.ws_wells(id) on delete cascade,
  formation_key text not null,
  name text not null,
  unit_id uuid,
  chain_id uuid not null,
  version_no integer not null default 1 check (version_no >= 1),
  previous_version_id uuid references public.ws_tops(id),
  resolves_ids uuid[],
  role text not null check (role in ('interpretation', 'official')),
  status text not null check (status in ('preliminary', 'confirmed', 'revised', 'withdrawn', 'final')),
  confidence text check (confidence in ('low', 'medium', 'high')),
  basis text,
  evidence_ids uuid[] not null default '{}',
  depth_value numeric not null,
  depth_unit text not null check (depth_unit in ('m', 'ft')),
  depth_ref text not null check (depth_ref in ('MD', 'TVD', 'TVDSS')),
  depth_datum text not null check (depth_datum in ('KB', 'RT', 'GL', 'MSL')),
  depth_kind text not null check (depth_kind in ('bit_depth', 'lagged_sample', 'logged', 'prognosis', 'planned', 'event')),
  md_calc_m numeric not null,
  tvd_calc_m numeric,
  tvdss_calc_m numeric,
  survey_version text,
  calc_method text not null check (calc_method in ('minimum_curvature', 'minimum_curvature_extrapolated', 'vertical')),
  range_top_md_m numeric,
  range_base_md_m numeric,
  occurred_at timestamptz not null,
  local_offset_min smallint not null,
  created_by uuid not null default auth.uid(),
  client_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  server_seq bigint generated always as identity,
  device_id uuid,
  schema_version integer not null default 1,
  app_build text,
  engine_version text,
  constraint ws_tops_range_order check (range_top_md_m is null or range_base_md_m is null or range_base_md_m >= range_top_md_m)
);
create index if not exists ws_tops_well_formation_idx on public.ws_tops (well_id, formation_key);
create index if not exists ws_tops_well_seq_idx on public.ws_tops (well_id, server_seq);
create index if not exists ws_tops_chain_idx on public.ws_tops (well_id, chain_id);

-- ---- ws_photos ---------------------------------------------------------------

create table if not exists public.ws_photos (
  id uuid primary key,
  well_id uuid not null references public.ws_wells(id) on delete cascade,
  sample_id uuid,
  record_id uuid,
  hole_section text,
  storage_prefix text not null,
  variants jsonb not null default '{}'::jsonb,
  original_sha256 text,
  content_type text not null default 'image/webp',
  caption text,
  tags text[] not null default '{}',
  captured_at timestamptz not null,
  local_offset_min smallint not null,
  depth_value numeric,
  depth_unit text check (depth_unit in ('m', 'ft')),
  depth_ref text check (depth_ref in ('MD', 'TVD', 'TVDSS')),
  depth_datum text check (depth_datum in ('KB', 'RT', 'GL', 'MSL')),
  depth_kind text check (depth_kind in ('bit_depth', 'lagged_sample', 'logged', 'prognosis', 'planned', 'event')),
  md_calc_m numeric,
  tvd_calc_m numeric,
  tvdss_calc_m numeric,
  survey_version text,
  calc_method text check (calc_method in ('minimum_curvature', 'minimum_curvature_extrapolated', 'vertical')),
  created_by uuid not null default auth.uid(),
  client_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  server_seq bigint generated always as identity,
  device_id uuid,
  schema_version integer not null default 1,
  app_build text,
  engine_version text,
  constraint ws_photos_depth_all_or_none check (
    num_nonnulls(depth_value, depth_unit, depth_ref, depth_datum, depth_kind, md_calc_m, calc_method) in (0, 7))
);
create index if not exists ws_photos_well_seq_idx on public.ws_photos (well_id, server_seq);
create index if not exists ws_photos_sample_idx on public.ws_photos (sample_id);

-- ---- ws_reports, ws_signoffs, ws_publications --------------------------------

create table if not exists public.ws_reports (
  id uuid primary key,
  well_id uuid not null references public.ws_wells(id) on delete cascade,
  kind text not null check (kind in ('daily', 'handover')),
  report_date date not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  chain_id uuid not null,
  version_no integer not null default 1 check (version_no >= 1),
  previous_version_id uuid references public.ws_reports(id),
  template_id text,
  canonical jsonb not null,
  content_hash text not null,
  generated_at timestamptz not null,
  local_offset_min smallint not null,
  created_by uuid not null default auth.uid(),
  client_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  server_seq bigint generated always as identity,
  device_id uuid,
  schema_version integer not null default 1,
  app_build text,
  engine_version text
);
create index if not exists ws_reports_well_kind_date_idx on public.ws_reports (well_id, kind, report_date);
create index if not exists ws_reports_well_seq_idx on public.ws_reports (well_id, server_seq);

create table if not exists public.ws_signoffs (
  id uuid primary key,
  well_id uuid not null references public.ws_wells(id) on delete cascade,
  report_id uuid not null references public.ws_reports(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  role public.ws_role not null,
  signed_at timestamptz not null,
  local_offset_min smallint not null,
  report_version integer not null,
  content_hash text not null,
  statement text not null,
  countersignature jsonb,
  countersigned_at timestamptz,
  created_by uuid not null default auth.uid(),
  client_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  server_seq bigint generated always as identity,
  device_id uuid,
  schema_version integer not null default 1,
  app_build text,
  engine_version text
);
create index if not exists ws_signoffs_well_seq_idx on public.ws_signoffs (well_id, server_seq);
create index if not exists ws_signoffs_report_idx on public.ws_signoffs (report_id);

create table if not exists public.ws_publications (
  id uuid primary key default gen_random_uuid(),
  well_id uuid not null references public.ws_wells(id) on delete cascade,
  kind text not null check (kind in ('tops', 'intervals', 'photos')),
  source_ids uuid[] not null default '{}',
  target_ids uuid[] not null default '{}',
  published_by uuid not null default auth.uid(),
  published_at timestamptz not null default now(),
  notes text
);

-- ---- sample stage order: a mandatory predecessor cannot be skipped ----------

create or replace function public.ws_sample_stage_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ordered text[] := array['scheduled', 'due', 'caught', 'washed', 'dried', 'described', 'photographed', 'bagged'];
  mandatory text[];
  pos integer;
  s text;
begin
  select coalesce(array(select jsonb_array_elements_text(w.settings -> 'mandatory_sample_stages')), '{}'::text[])
    into mandatory
    from public.ws_samples smp join public.ws_wells w on w.id = smp.well_id
   where smp.id = new.sample_id;
  pos := array_position(ordered, new.stage);
  foreach s in array mandatory loop
    if array_position(ordered, s) < pos
       and not exists (select 1 from public.ws_sample_stages x where x.sample_id = new.sample_id and x.stage = s) then
      raise exception 'Sample stage % needs the mandatory stage % first.', new.stage, s using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists ws_sample_stage_guard on public.ws_sample_stages;
create trigger ws_sample_stage_guard before insert on public.ws_sample_stages
  for each row execute function public.ws_sample_stage_guard();

-- ---- conflicts view (the client mirrors this rule) ---------------------------

create or replace view public.ws_conflicts as
with rec_heads as (
  select r.well_id, 'record'::text as entity, r.kind, r.chain_id, r.id
    from public.ws_records r
   where r.kind in ('interpretation', 'decision', 'narrative')
     and not exists (select 1 from public.ws_records n where n.previous_version_id = r.id)
     and not exists (select 1 from public.ws_records v where v.resolves_ids @> array[r.id])
), top_heads as (
  select t.well_id, 'top'::text as entity, t.role as kind, t.role, t.chain_id, t.id, t.formation_key, t.status
    from public.ws_tops t
   where not exists (select 1 from public.ws_tops n where n.previous_version_id = t.id)
     and not exists (select 1 from public.ws_tops v where v.resolves_ids @> array[t.id])
)
select well_id, entity, kind, chain_id, 'chain_heads' as conflict, array_agg(id) as head_ids
  from rec_heads group by well_id, entity, kind, chain_id having count(*) > 1
union all
select well_id, entity, kind, chain_id, 'chain_heads', array_agg(id)
  from top_heads group by well_id, entity, kind, chain_id having count(*) > 1
union all
select well_id, 'top', formation_key, null, 'dual_final', array_agg(id)
  from top_heads where role = 'official' and status = 'final'
 group by well_id, formation_key having count(*) > 1;

-- ---- RLS ---------------------------------------------------------------------

alter table public.ws_wells enable row level security;
alter table public.ws_well_members enable row level security;
alter table public.ws_prognosis enable row level security;
alter table public.ws_records enable row level security;
alter table public.ws_samples enable row level security;
alter table public.ws_sample_stages enable row level security;
alter table public.ws_tops enable row level security;
alter table public.ws_photos enable row level security;
alter table public.ws_reports enable row level security;
alter table public.ws_signoffs enable row level security;
alter table public.ws_publications enable row level security;

drop policy if exists "ws_wells_select_org" on public.ws_wells;
create policy "ws_wells_select_org" on public.ws_wells for select
  using (public.is_org_member(organization_id) or public.is_super_admin());
drop policy if exists "ws_wells_insert_org" on public.ws_wells;
create policy "ws_wells_insert_org" on public.ws_wells for insert
  with check (
    created_by = auth.uid()
    and public.is_org_member(organization_id)
    and exists (select 1 from public.geo_wells g where g.id = geo_well_id));
drop policy if exists "ws_wells_update_admin" on public.ws_wells;
create policy "ws_wells_update_admin" on public.ws_wells for update
  using (public.ws_can_admin(id)) with check (public.ws_can_admin(id));

drop policy if exists "ws_well_members_select_member" on public.ws_well_members;
create policy "ws_well_members_select_member" on public.ws_well_members for select
  using (public.ws_is_member(well_id));
drop policy if exists "ws_well_members_insert_admin" on public.ws_well_members;
create policy "ws_well_members_insert_admin" on public.ws_well_members for insert
  with check (public.ws_can_admin(well_id));
drop policy if exists "ws_well_members_update_admin" on public.ws_well_members;
create policy "ws_well_members_update_admin" on public.ws_well_members for update
  using (public.ws_can_admin(well_id)) with check (public.ws_can_admin(well_id));
drop policy if exists "ws_well_members_delete_admin" on public.ws_well_members;
create policy "ws_well_members_delete_admin" on public.ws_well_members for delete
  using (public.ws_can_admin(well_id));

-- append-only tables: select for members, insert for members as themselves
drop policy if exists "ws_prognosis_select" on public.ws_prognosis;
create policy "ws_prognosis_select" on public.ws_prognosis for select using (public.ws_is_member(well_id));
drop policy if exists "ws_prognosis_insert" on public.ws_prognosis;
create policy "ws_prognosis_insert" on public.ws_prognosis for insert
  with check (public.ws_can_admin(well_id) and created_by = auth.uid());

drop policy if exists "ws_records_select" on public.ws_records;
create policy "ws_records_select" on public.ws_records for select using (public.ws_is_member(well_id));
drop policy if exists "ws_records_insert" on public.ws_records;
create policy "ws_records_insert" on public.ws_records for insert
  with check (
    public.ws_is_member(well_id) and created_by = auth.uid()
    and (resolves_ids is null or cardinality(resolves_ids) = 0 or public.ws_can_approve(well_id)));

drop policy if exists "ws_samples_select" on public.ws_samples;
create policy "ws_samples_select" on public.ws_samples for select using (public.ws_is_member(well_id));
drop policy if exists "ws_samples_insert" on public.ws_samples;
create policy "ws_samples_insert" on public.ws_samples for insert
  with check (public.ws_is_member(well_id) and created_by = auth.uid());

drop policy if exists "ws_sample_stages_select" on public.ws_sample_stages;
create policy "ws_sample_stages_select" on public.ws_sample_stages for select using (public.ws_is_member(well_id));
drop policy if exists "ws_sample_stages_insert" on public.ws_sample_stages;
create policy "ws_sample_stages_insert" on public.ws_sample_stages for insert
  with check (public.ws_is_member(well_id) and created_by = auth.uid());

drop policy if exists "ws_tops_select" on public.ws_tops;
create policy "ws_tops_select" on public.ws_tops for select using (public.ws_is_member(well_id));
drop policy if exists "ws_tops_insert" on public.ws_tops;
create policy "ws_tops_insert" on public.ws_tops for insert
  with check (
    public.ws_is_member(well_id) and created_by = auth.uid()
    and (status <> 'final' or public.ws_can_approve(well_id))
    and (resolves_ids is null or cardinality(resolves_ids) = 0 or public.ws_can_approve(well_id)));

drop policy if exists "ws_photos_select" on public.ws_photos;
create policy "ws_photos_select" on public.ws_photos for select using (public.ws_is_member(well_id));
drop policy if exists "ws_photos_insert" on public.ws_photos;
create policy "ws_photos_insert" on public.ws_photos for insert
  with check (public.ws_is_member(well_id) and created_by = auth.uid());

drop policy if exists "ws_reports_select" on public.ws_reports;
create policy "ws_reports_select" on public.ws_reports for select using (public.ws_is_member(well_id));
drop policy if exists "ws_reports_insert" on public.ws_reports;
create policy "ws_reports_insert" on public.ws_reports for insert
  with check (public.ws_is_member(well_id) and created_by = auth.uid());

drop policy if exists "ws_signoffs_select" on public.ws_signoffs;
create policy "ws_signoffs_select" on public.ws_signoffs for select using (public.ws_is_member(well_id));
drop policy if exists "ws_signoffs_insert" on public.ws_signoffs;
create policy "ws_signoffs_insert" on public.ws_signoffs for insert
  with check (
    public.ws_is_member(well_id) and user_id = auth.uid() and created_by = auth.uid()
    and countersignature is null and countersigned_at is null
    and role = (select m.role from public.ws_well_members m where m.well_id = ws_signoffs.well_id and m.user_id = auth.uid() and m.status = 'active'));

drop policy if exists "ws_publications_select" on public.ws_publications;
create policy "ws_publications_select" on public.ws_publications for select using (public.ws_is_member(well_id));
drop policy if exists "ws_publications_insert" on public.ws_publications;
create policy "ws_publications_insert" on public.ws_publications for insert
  with check (
    published_by = auth.uid()
    and exists (
      select 1 from public.ws_wells w join public.geo_wells g on g.id = w.geo_well_id
       where w.id = well_id and g.user_id = auth.uid()));

-- no client ever updates or deletes the record
revoke update, delete on public.ws_prognosis, public.ws_records, public.ws_samples, public.ws_sample_stages,
  public.ws_tops, public.ws_photos, public.ws_reports, public.ws_signoffs, public.ws_publications from authenticated;
revoke delete on public.ws_wells from authenticated;
grant select on public.ws_conflicts to authenticated;

-- ---- storage: the wellsite bucket, path {org}/{well}/photos/{photo}/{variant} ---

insert into storage.buckets (id, name, public) values ('wellsite', 'wellsite', false)
on conflict (id) do nothing;

-- text comparison on the path segment; objects.name qualified (the B5a lesson)
create or replace function public.ws_member_of_path(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ws_wells w
     where w.id::text = (storage.foldername(p_name))[2]
       and public.ws_is_member(w.id));
$$;

drop policy if exists "wellsite_objects_select_member" on storage.objects;
create policy "wellsite_objects_select_member" on storage.objects for select
  using (bucket_id = 'wellsite' and public.ws_member_of_path(objects.name));
drop policy if exists "wellsite_objects_insert_member" on storage.objects;
create policy "wellsite_objects_insert_member" on storage.objects for insert
  with check (bucket_id = 'wellsite' and public.ws_member_of_path(objects.name));
-- re-upload of the same bytes is idempotent (upsert needs update); still member-gated
drop policy if exists "wellsite_objects_update_member" on storage.objects;
create policy "wellsite_objects_update_member" on storage.objects for update
  using (bucket_id = 'wellsite' and public.ws_member_of_path(objects.name))
  with check (bucket_id = 'wellsite' and public.ws_member_of_path(objects.name));
