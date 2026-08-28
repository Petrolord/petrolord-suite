-- P6.5 (shared per-well model record): po_well_models.
--
-- WHY THIS TABLE EXISTS. The gas lift (P4), ESP (P5) and rod pump (P6)
-- studios each built their own copy of the same well description --
-- trajectory, fluid, temperature, inflow and completion -- and each
-- stored it inside its own design payload. That meant the same well was
-- described three times, three studios could disagree about it, and the
-- nodal cross-check of well tests deferred at P3 had nothing to check
-- against: the spine knew the wells but not their inflow.
--
-- This is the well's OWN description, so it lives with the well rather
-- than inside any one design. A design still stores the duty it was run
-- at (rate, water cut, wellhead pressure, equipment) in its own row;
-- what moves here is only what belongs to the well itself.
--
-- ONE CURRENT MODEL PER WELL, enforced by the unique key. Named
-- revisions ("2025 build-up", "post-frac") are a real want, but the
-- cross-check needs an unambiguous answer to "what does this well do",
-- so the simple shape ships first and revisions can be added as a
-- child table without changing this one.
--
-- RLS is the po_* spine pattern verbatim: read through the parent
-- field (own or shared with the organisation), write owner-only with a
-- parent-ownership check.
--
-- Safe to apply ahead of the app deploy (new empty table, no tile
-- change); idempotent.

create table if not exists public.po_well_models (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users (id) on delete cascade,
    well_id     uuid not null references public.po_wells (id) on delete cascade,
    model_data  jsonb not null,
    notes       text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    unique (well_id)
);

comment on table public.po_well_models is
    'Production P6.5: the well''s own IPR/VLP description (trajectory, fluid, temperature, inflow, completion), shared by every production studio. Designs keep their own duty; this is what belongs to the well.';
comment on column public.po_well_models.model_data is
    'Studio well-model inputs as typed: { schema, well, fluid, inflow, completion }. Strings, not coerced numbers, so a model round-trips into the form it came from.';

create index if not exists po_well_models_well_id_idx
    on public.po_well_models (well_id);

alter table public.po_well_models enable row level security;

drop policy if exists "po_well_models_select_via_field" on public.po_well_models;
create policy "po_well_models_select_via_field"
    on public.po_well_models for select
    using (exists (
      select 1
      from public.po_wells w
      join public.po_fields f on f.id = w.field_id
      where w.id = po_well_models.well_id
        and (f.user_id = auth.uid()
             or (f.organization_id is not null and public.is_org_member(f.organization_id)))
    ));

drop policy if exists "po_well_models_write_own" on public.po_well_models;
create policy "po_well_models_write_own"
    on public.po_well_models for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.po_wells w
                  where w.id = po_well_models.well_id and w.user_id = auth.uid())
    );
