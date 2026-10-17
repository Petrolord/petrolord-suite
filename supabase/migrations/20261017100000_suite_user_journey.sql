-- =============================================================================
-- Guided Journey, stage 1: the journey record (owner decisions 2026-10-17)
-- docs/scope/GuidedJourney-DESIGN.md, section 5
-- -----------------------------------------------------------------------------
-- Petrolord greets every user by name and points to one next step, chosen for
-- their own disciplines (a drilling engineer is never shown seismic). Journey
-- state is DERIVED from the tables that already hold the facts (membership,
-- projects, each app's saved work); this migration stores only what cannot be
-- derived:
--
--   suite_user_journey          one row per person: disciplines, guidance mode
--                               (guide | quiet), organisations whose welcome
--                               they have seen, dismissed steps, answered
--                               prompts. Readable by its owner only; written
--                               only through suite_journey_set / _mark, which
--                               validate every value.
--   suite_journey_work_sources  config: which table shows that a person has
--                               started work in which app and discipline.
--                               Readable by any signed-in user; no client writes.
--   suite_journey_state(...)    SECURITY INVOKER: one jsonb with the person's
--                               org, role, team size, projects and, per app of
--                               their disciplines, whether they have work in it
--                               (own rows) and whether the current project
--                               holds work in it (rows they can see). RLS on
--                               every table decides what counts, exactly as in
--                               the apps.
--   suite_journey_set(...)      SECURITY DEFINER, writes the caller's own row:
--                               guidance mode and disciplines
--   suite_journey_mark(...)     SECURITY DEFINER, appends to the caller's own
--                               row: welcomed org, dismissed step, answered
--                               prompt, greeted
--
-- The table is per user (second engineer agreed 2026-10-17); it touches no
-- shared table. Idempotent; no transaction lines.
-- Rollback: tools/security/journey/rollback/20261017100000.rollback.sql
-- Verify:   tools/security/journey/verify/20261017100000.verify.sql
-- Dry run:  tools/security/journey/probes/run_dryrun.sh
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Disciplines (keys are the Suite module slugs plus 'management')
-- ---------------------------------------------------------------------------
create or replace function public.suite_journey_disciplines()
returns text[] language sql immutable as $$
    select array['geoscience', 'reservoir', 'drilling', 'production', 'facilities', 'process-safety',
                 'midstream-downstream', 'economics', 'assurance', 'data-ai', 'management']::text[];
$$;

-- ---------------------------------------------------------------------------
-- suite_user_journey
-- ---------------------------------------------------------------------------
create table if not exists public.suite_user_journey (
    user_id              uuid primary key references auth.users (id) on delete cascade,
    disciplines          text[] not null default '{}',
    disciplines_source   text check (disciplines_source in ('chosen', 'inferred')),
    guidance             text not null default 'guide' check (guidance in ('guide', 'quiet')),
    guidance_changed_at  timestamptz,
    welcomed_orgs        uuid[] not null default '{}',
    dismissed            text[] not null default '{}',
    acknowledged         jsonb not null default '{}'::jsonb,
    last_greeted_at      timestamptz,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),
    constraint suite_user_journey_disciplines_known
        check (disciplines <@ public.suite_journey_disciplines())
);
comment on table public.suite_user_journey is
    'Guided Journey: per-person choices only (disciplines, guidance mode, seen welcomes, dismissed steps, answered prompts). Everything else is derived by suite_journey_state. Written only through suite_journey_set and suite_journey_mark.';

alter table public.suite_user_journey enable row level security;
drop policy if exists suite_user_journey_select_own on public.suite_user_journey;
create policy suite_user_journey_select_own on public.suite_user_journey
    for select to authenticated using (user_id = auth.uid());
revoke all on public.suite_user_journey from anon, authenticated;
grant select on public.suite_user_journey to authenticated;

-- ---------------------------------------------------------------------------
-- suite_journey_work_sources (config)
-- ---------------------------------------------------------------------------
create table if not exists public.suite_journey_work_sources (
    app_id          text not null,
    table_name      text not null,
    discipline      text not null check (discipline = any (public.suite_journey_disciplines())),
    kind            text not null check (kind in ('data', 'case')),
    owner_column    text not null default 'user_id' check (owner_column in ('user_id', 'created_by')),
    project_column  text check (project_column in ('suite_project_id')),
    primary key (app_id, table_name)
);
comment on table public.suite_journey_work_sources is
    'Guided Journey: the table that shows a person has started work in an app, and the app''s discipline. Seeded from projectsService APP_MOVABLE plus the geoscience registries; a jest guard keeps the two equal.';
alter table public.suite_journey_work_sources enable row level security;
drop policy if exists suite_journey_work_sources_read on public.suite_journey_work_sources;
create policy suite_journey_work_sources_read on public.suite_journey_work_sources
    for select to authenticated using (true);
revoke all on public.suite_journey_work_sources from anon, authenticated;
grant select on public.suite_journey_work_sources to authenticated;

-- Seed: every routed app's saved-work table (projectsService APP_MOVABLE and
-- MOVABLE, mapped to app ids 2026-10-17), plus the starter apps whose records
-- are owned by created_by or carry no project. Not seeded: legacy tables no
-- app reads (saved_casing_design, saved_compressor_pump, saved_drilling_fluids,
-- saved_mbal, saved_petrophysics, saved_pvt, saved_reservoir_balance,
-- saved_well_cost_iq, saved_well_cost, saved_pipeline_sizer projects),
-- geo_culture and po_fields (shared by several apps).
insert into public.suite_journey_work_sources (app_id, table_name, discipline, kind, owner_column, project_column) values
    ('seismolord', 'seismic_volumes', 'geoscience', 'data', 'user_id', 'suite_project_id'),
    ('seismolord', 'seismic_lines', 'geoscience', 'data', 'user_id', 'suite_project_id'),
    ('seismolord', 'seismic_projects', 'geoscience', 'case', 'user_id', 'suite_project_id'),
    ('well-data-manager', 'geo_wells', 'geoscience', 'data', 'user_id', 'suite_project_id'),
    ('mapping-surface-studio', 'geo_surfaces', 'geoscience', 'data', 'user_id', 'suite_project_id'),
    ('well-correlation', 'geo_correlation_sections', 'geoscience', 'case', 'user_id', 'suite_project_id'),
    ('petrophysics-studio', 'petro_projects', 'geoscience', 'case', 'user_id', 'suite_project_id'),
    ('pore-pressure-studio', 'pp_projects', 'geoscience', 'case', 'user_id', 'suite_project_id'),
    ('rock-physics-studio', 'rp_projects', 'geoscience', 'case', 'user_id', 'suite_project_id'),
    ('earth-modeling', 'em_models', 'geoscience', 'case', 'user_id', 'suite_project_id'),
    ('basinflow-genesis', 'bf_wells', 'geoscience', 'case', 'user_id', 'suite_project_id'),
    ('reservoircalc-pro', 'rcp_prospects', 'geoscience', 'case', 'user_id', 'suite_project_id'),
    ('reservoircalc-pro', 'saved_quickvol_projects', 'geoscience', 'case', 'user_id', 'suite_project_id'),
    ('qi-studio', 'saved_qi_studio_projects', 'geoscience', 'case', 'user_id', 'suite_project_id'),
    ('risked-reserves-valuation', 'rrv_valuations', 'reservoir', 'case', 'user_id', 'suite_project_id'),
    ('fluid-systems-studio', 'saved_fluid_studio_projects', 'reservoir', 'case', 'user_id', 'suite_project_id'),
    ('scal-studio', 'saved_scal_projects', 'reservoir', 'case', 'user_id', 'suite_project_id'),
    ('decline-curve-analysis', 'saved_dca_projects', 'reservoir', 'case', 'user_id', 'suite_project_id'),
    ('forecast-scenario-hub', 'saved_scenario_hub_projects', 'reservoir', 'case', 'user_id', 'suite_project_id'),
    ('well-test-analyzer', 'saved_well_test_projects', 'reservoir', 'case', 'user_id', 'suite_project_id'),
    ('fractional-flow-calculator', 'saved_waterflood_design_projects', 'reservoir', 'case', 'user_id', 'suite_project_id'),
    ('voidage-replacement-monitor', 'saved_vrr_projects', 'reservoir', 'case', 'user_id', 'suite_project_id'),
    ('recovery-factor-estimator', 'saved_rf_projects', 'reservoir', 'case', 'user_id', 'suite_project_id'),
    ('eor-screening', 'saved_eor_screening_projects', 'reservoir', 'case', 'user_id', 'suite_project_id'),
    ('well-spacing-optimizer', 'saved_well_spacing_projects', 'reservoir', 'case', 'user_id', 'suite_project_id'),
    ('reservoir-balance', 'rb_cases', 'reservoir', 'case', 'user_id', 'suite_project_id'),
    ('reservoir-simulation-studio', 'sim_cases', 'reservoir', 'case', 'user_id', 'suite_project_id'),
    ('well-planning', 'wp_sites', 'drilling', 'case', 'user_id', 'suite_project_id'),
    ('casing-tubing-design-pro', 'wp_ct_cases', 'drilling', 'case', 'user_id', null),
    ('well-cost-time', 'wp_wct_cases', 'drilling', 'case', 'user_id', null),
    ('production-surveillance-studio', 'saved_surveillance_projects', 'production', 'case', 'user_id', 'suite_project_id'),
    ('production-allocation-studio', 'saved_allocation_projects', 'production', 'case', 'user_id', 'suite_project_id'),
    ('gas-lift-design-studio', 'saved_gaslift_projects', 'production', 'case', 'user_id', 'suite_project_id'),
    ('esp-design-studio', 'saved_esp_projects', 'production', 'case', 'user_id', 'suite_project_id'),
    ('rod-pump-design-studio', 'saved_rodpump_projects', 'production', 'case', 'user_id', 'suite_project_id'),
    ('gas-well-performance-studio', 'saved_gaswell_projects', 'production', 'case', 'user_id', 'suite_project_id'),
    ('choke-performance-studio', 'saved_choke_projects', 'production', 'case', 'user_id', 'suite_project_id'),
    ('nodal-analysis-engine', 'saved_nodal_analysis_projects', 'production', 'case', 'user_id', 'suite_project_id'),
    ('artificial-lift-designer', 'saved_liftadvisor_projects', 'production', 'case', 'user_id', 'suite_project_id'),
    ('flow-assurance-studio', 'saved_flowassurance_projects', 'production', 'case', 'user_id', 'suite_project_id'),
    ('well-intervention-planner', 'saved_intervention_projects', 'production', 'case', 'user_id', 'suite_project_id'),
    ('production-network-studio', 'saved_network_projects', 'production', 'case', 'user_id', 'suite_project_id'),
    ('separator-slug-catcher-designer', 'saved_separator_projects', 'facilities', 'case', 'user_id', 'suite_project_id'),
    ('compressor-station-designer', 'saved_compressor_projects', 'facilities', 'case', 'user_id', 'suite_project_id'),
    ('pump-station-designer', 'saved_pump_projects', 'facilities', 'case', 'user_id', 'suite_project_id'),
    ('control-valve-sizing', 'saved_valve_projects', 'facilities', 'case', 'user_id', 'suite_project_id'),
    ('storage-tank-designer', 'saved_tank_projects', 'facilities', 'case', 'user_id', 'suite_project_id'),
    ('flow-metering-designer', 'saved_meter_projects', 'facilities', 'case', 'user_id', 'suite_project_id'),
    ('heat-exchanger-sizer', 'saved_heat_exchanger_projects', 'facilities', 'case', 'user_id', 'suite_project_id'),
    ('gas-treating-dehydration', 'saved_gasprocessing_projects', 'facilities', 'case', 'user_id', 'suite_project_id'),
    ('relief-blowdown-sizer', 'saved_relief_projects', 'facilities', 'case', 'user_id', 'suite_project_id'),
    ('facility-network-hydraulics', 'saved_linesizing_projects', 'facilities', 'case', 'user_id', 'suite_project_id'),
    ('corrosion-rate-predictor', 'saved_corrosion_projects', 'facilities', 'case', 'user_id', 'suite_project_id'),
    ('produced-water-treatment', 'saved_pwt_projects', 'facilities', 'case', 'user_id', 'suite_project_id'),
    ('lopa-sil-studio', 'ps_lopa_studies', 'process-safety', 'case', 'created_by', null),
    ('consequence-studio', 'ps_consequence_studies', 'process-safety', 'case', 'created_by', null),
    ('qra-studio', 'ps_qra_studies', 'process-safety', 'case', 'created_by', null),
    ('crude-assay-blending-studio', 'saved_crude_assay_projects', 'midstream-downstream', 'case', 'user_id', 'suite_project_id'),
    ('product-blending-optimizer', 'saved_blend_optimizer_projects', 'midstream-downstream', 'case', 'user_id', 'suite_project_id'),
    ('refinery-planning-scheduling', 'saved_refinery_plan_projects', 'midstream-downstream', 'case', 'user_id', 'suite_project_id'),
    ('modular-refinery-feasibility', 'saved_modular_refinery_projects', 'midstream-downstream', 'case', 'user_id', 'suite_project_id'),
    ('terminal-depot-studio', 'saved_terminal_projects', 'midstream-downstream', 'case', 'user_id', 'suite_project_id'),
    ('materials-spares-planner', 'scm_materials_projects', 'midstream-downstream', 'case', 'user_id', 'suite_project_id'),
    ('marine-logistics-planner', 'scm_marine_projects', 'midstream-downstream', 'case', 'user_id', 'suite_project_id'),
    ('fuel-pricing-supply-chain', 'saved_fuel_pricing_projects', 'midstream-downstream', 'case', 'user_id', 'suite_project_id'),
    ('lpg-cng-rollout-studio', 'saved_lpg_cng_projects', 'midstream-downstream', 'case', 'user_id', 'suite_project_id'),
    ('energy-utilities-efficiency', 'saved_energy_efficiency_projects', 'midstream-downstream', 'case', 'user_id', 'suite_project_id'),
    ('carbon-footprint-abatement', 'saved_carbon_projects', 'midstream-downstream', 'case', 'user_id', 'suite_project_id'),
    ('flare-gas-to-value', 'saved_flare_projects', 'midstream-downstream', 'case', 'user_id', 'suite_project_id'),
    ('epe-suite', 'epe_cases', 'economics', 'case', 'user_id', 'suite_project_id'),
    ('epe-suite', 'epe_assumption_sets', 'economics', 'case', 'user_id', 'suite_project_id'),
    ('npv-scenario-builder', 'saved_npv_projects', 'economics', 'case', 'user_id', 'suite_project_id'),
    ('decision-tree-builder', 'saved_decision_tree_projects', 'economics', 'case', 'user_id', 'suite_project_id'),
    ('decision-studio', 'saved_decision_tree_projects', 'economics', 'case', 'user_id', 'suite_project_id'),
    ('fdp-accelerator', 'saved_fdp_projects', 'economics', 'case', 'user_id', 'suite_project_id'),
    ('probabilistic-breakeven-analyzer', 'saved_breakeven_projects', 'economics', 'case', 'user_id', 'suite_project_id'),
    ('value-of-information-analyzer', 'saved_voi_projects', 'economics', 'case', 'user_id', 'suite_project_id'),
    ('technical-report-autopilot', 'saved_report_autopilot_projects', 'economics', 'case', 'user_id', 'suite_project_id'),
    ('risk-register', 'risk_register', 'assurance', 'case', 'created_by', null),
    ('management-of-change', 'moc_records', 'assurance', 'case', 'created_by', null),
    ('audit-findings-manager', 'audit_records', 'assurance', 'case', 'created_by', null),
    ('data-quality-studio', 'dai_qc_runs', 'data-ai', 'case', 'created_by', null),
    ('ml-workbench', 'dai_ml_runs', 'data-ai', 'case', 'created_by', null)
on conflict (app_id, table_name) do update set
    discipline = excluded.discipline, kind = excluded.kind,
    owner_column = excluded.owner_column, project_column = excluded.project_column;

-- One existence probe on a configured work source, under the caller's RLS.
-- Only tables listed in suite_journey_work_sources can be probed; a table or
-- column that is missing, or not readable by the caller, answers null.
create or replace function public.suite_journey_has_row(p_table text, p_col text, p_val uuid)
returns boolean
language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare r boolean;
begin
    if not exists (select 1 from public.suite_journey_work_sources s
                    where s.table_name = p_table and p_col in (s.owner_column, s.project_column)) then
        raise exception 'Not a journey work source.' using errcode = '22023';
    end if;
    execute format('select exists (select 1 from public.%I where %I = $1)', p_table, p_col) into r using p_val;
    return r;
exception
    when undefined_table or undefined_column or insufficient_privilege then return null;
end $$;
revoke all on function public.suite_journey_has_row(text, text, uuid) from public, anon;
grant execute on function public.suite_journey_has_row(text, text, uuid) to authenticated;

-- The caller's own name and dates from auth.users: a narrow definer reader,
-- so the invoker function below needs no auth schema grant
create or replace function public.suite_journey_me()
returns table (email text, display_name text, full_name text, created_at timestamptz, last_sign_in_at timestamptz, invited_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
    select u.email::text, u.raw_user_meta_data ->> 'display_name', coalesce(u.raw_user_meta_data ->> 'full_name', up.full_name),
           u.created_at, u.last_sign_in_at, u.invited_at
      from auth.users u left join public.user_profiles up on up.id = u.id
     where u.id = auth.uid();
$$;
revoke all on function public.suite_journey_me() from public, anon;
grant execute on function public.suite_journey_me() to authenticated;

-- ---------------------------------------------------------------------------
-- suite_journey_state: everything the guide needs, one round trip
-- ---------------------------------------------------------------------------
create or replace function public.suite_journey_state(p_project uuid default null, p_apps text[] default null)
returns jsonb
language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare
    v_uid      uuid := auth.uid();
    v_org      uuid;
    v_member   record;
    v_journey  jsonb;
    v_work     jsonb := '{}'::jsonb;
    v_src      record;
    v_any      boolean;
    v_in       boolean;
    v_disc     text[];
begin
    if v_uid is null then
        raise exception 'Sign in first.' using errcode = '42501';
    end if;

    select to_jsonb(j) - 'user_id' into v_journey from public.suite_user_journey j where j.user_id = v_uid;
    v_disc := coalesce((select array(select jsonb_array_elements_text(v_journey -> 'disciplines'))), '{}');

    -- the organisation the person works in (same rule as my_org_id)
    select om.organization_id, om.role, om.status, om.joined_at, om.invited_at into v_member
      from public.organization_members om
     where om.user_id = v_uid and coalesce(lower(om.status), 'active') = 'active'
     order by om.joined_at nulls last, om.created_at
     limit 1;
    v_org := v_member.organization_id;

    -- work: own rows ("any") and rows in the current project the person can see
    -- ("in_project"), for the requested apps, else the apps of the person's
    -- disciplines, else every source
    for v_src in
        select s.* from public.suite_journey_work_sources s
         where (p_apps is not null and s.app_id = any (p_apps))
            or (p_apps is null and (cardinality(v_disc) = 0 or s.discipline = any (v_disc)))
         order by s.app_id, s.table_name
    loop
        -- a source the caller cannot read (or a table not on this database) counts as no work
        v_any := coalesce(public.suite_journey_has_row(v_src.table_name, v_src.owner_column, v_uid), false);
        v_in := case when p_project is not null and v_src.project_column is not null
                     then public.suite_journey_has_row(v_src.table_name, v_src.project_column, p_project) end;
        -- one entry per app: work in any of its tables counts
        v_work := jsonb_set(v_work, array[v_src.app_id], jsonb_build_object(
            'any', coalesce((v_work -> v_src.app_id ->> 'any')::boolean, false) or v_any,
            'in_project', case when v_in is null then (v_work -> v_src.app_id -> 'in_project')
                               else to_jsonb(coalesce((v_work -> v_src.app_id ->> 'in_project')::boolean, false) or v_in) end,
            'discipline', v_src.discipline,
            'kind', v_src.kind));
    end loop;

    return jsonb_build_object(
        'now', now(),
        'user', (select to_jsonb(m) from public.suite_journey_me() m),
        'org', case when v_org is null then null else jsonb_build_object(
                    'id', v_org,
                    'name', (select o.name from public.organizations o where o.id = v_org),
                    'role', v_member.role,
                    'joined_at', coalesce(v_member.joined_at, v_member.invited_at),
                    'member_count', (select count(*) from public.organization_members m
                                      where m.organization_id = v_org and coalesce(lower(m.status), 'active') = 'active'))
               end,
        'projects', jsonb_build_object(
                    'real', (select count(*) from public.suite_projects p
                              where p.owner_user_id = v_uid and not p.is_default and p.status = 'active'),
                    'shared_with_me', (select count(*) from public.suite_projects p
                              where p.owner_user_id is distinct from v_uid and not p.is_default and p.status = 'active'),
                    'current_id', p_project,
                    'current_is_default', (select p.is_default from public.suite_projects p where p.id = p_project)),
        'work', v_work,
        'journey', coalesce(v_journey, jsonb_build_object('guidance', 'guide', 'disciplines', '[]'::jsonb, 'missing', true))
    );
end $$;
comment on function public.suite_journey_state(uuid, text[]) is
    'Guided Journey: the caller''s org, role, team size, projects and work per app, plus their journey row. SECURITY INVOKER: RLS on each table decides what counts.';
revoke all on function public.suite_journey_state(uuid, text[]) from public, anon;
grant execute on function public.suite_journey_state(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Writes: the caller's own row, validated
-- ---------------------------------------------------------------------------
create or replace function public.suite_journey_set(
    p_guidance text default null, p_disciplines text[] default null, p_source text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); r public.suite_user_journey;
begin
    if v_uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
    if p_guidance is not null and p_guidance not in ('guide', 'quiet') then
        raise exception 'Guidance is guide or quiet.' using errcode = '22023';
    end if;
    if p_disciplines is not null and not (p_disciplines <@ public.suite_journey_disciplines()) then
        raise exception 'Unknown discipline.' using errcode = '22023';
    end if;
    if p_source is not null and p_source not in ('chosen', 'inferred') then
        raise exception 'Discipline source is chosen or inferred.' using errcode = '22023';
    end if;
    insert into public.suite_user_journey (user_id) values (v_uid) on conflict (user_id) do nothing;
    update public.suite_user_journey j set
        guidance = coalesce(p_guidance, j.guidance),
        guidance_changed_at = case when p_guidance is not null and p_guidance is distinct from j.guidance then now() else j.guidance_changed_at end,
        disciplines = coalesce((select array(select distinct d from unnest(p_disciplines) d order by d)), j.disciplines),
        disciplines_source = case when p_disciplines is not null then coalesce(p_source, 'chosen') else j.disciplines_source end,
        updated_at = now()
     where j.user_id = v_uid
     returning * into r;
    return to_jsonb(r) - 'user_id';
end $$;
revoke all on function public.suite_journey_set(text, text[], text) from public, anon;
grant execute on function public.suite_journey_set(text, text[], text) to authenticated;

create or replace function public.suite_journey_mark(p_kind text, p_key text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); r public.suite_user_journey;
begin
    if v_uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
    if p_kind not in ('welcomed_org', 'dismissed', 'acknowledged', 'greeted') then
        raise exception 'Unknown mark.' using errcode = '22023';
    end if;
    if p_kind in ('dismissed', 'acknowledged') and (p_key is null or p_key !~ '^[a-z0-9:_-]{1,80}$') then
        raise exception 'A step key is 1 to 80 lower-case letters, digits, colons, dashes or underscores.' using errcode = '22023';
    end if;
    if p_kind = 'welcomed_org' then
        -- only an organisation the caller belongs to
        if not exists (select 1 from public.organization_members om
                        where om.user_id = v_uid and om.organization_id::text = p_key) then
            raise exception 'Not a member of that organisation.' using errcode = '42501';
        end if;
    end if;
    insert into public.suite_user_journey (user_id) values (v_uid) on conflict (user_id) do nothing;
    update public.suite_user_journey j set
        welcomed_orgs = case when p_kind = 'welcomed_org' and not (p_key::uuid = any (j.welcomed_orgs))
                             then j.welcomed_orgs || p_key::uuid else j.welcomed_orgs end,
        dismissed = case when p_kind = 'dismissed' and not (p_key = any (j.dismissed))
                         then j.dismissed || p_key else j.dismissed end,
        acknowledged = case when p_kind = 'acknowledged' and not (j.acknowledged ? p_key)
                            then j.acknowledged || jsonb_build_object(p_key, now()) else j.acknowledged end,
        last_greeted_at = case when p_kind = 'greeted' then now() else j.last_greeted_at end,
        updated_at = now()
     where j.user_id = v_uid
     returning * into r;
    return to_jsonb(r) - 'user_id';
end $$;
revoke all on function public.suite_journey_mark(text, text) from public, anon;
grant execute on function public.suite_journey_mark(text, text) to authenticated;
