-- P3 (Production Allocation Studio, docs/scope/
-- ProductionOperations-STATUS.md): the metered totals the wells are
-- back-allocated FROM.
--
-- The P1 spine holds per-well volumes (po_daily_production), which in a
-- commingled field are themselves an allocation. What allocation starts
-- from is a different data class: the facility, separator or export
-- meter reading for the whole field on a date. That is this table.
--
-- One metered stream per field per date (unique (field_id, total_date)),
-- so re-importing a corrected meter file overwrites in place. Fields
-- with several independent trains are out of scope here and stay a
-- future extension rather than a silent sum.
--
-- Sharing and RLS follow the rest of the spine exactly: read through
-- the parent po_fields row (owner, or org member when the field is
-- shared), write owner-only.
--
-- Safe to apply ahead of the app deploy (new empty table, no tile
-- change); idempotent.

create table if not exists public.po_field_totals (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references auth.users (id) on delete cascade,
    field_id   uuid not null references public.po_fields (id) on delete cascade,
    total_date date not null,
    oil_stb    numeric not null default 0 check (oil_stb >= 0),
    water_stb  numeric not null default 0 check (water_stb >= 0),
    gas_mscf   numeric not null default 0 check (gas_mscf >= 0),
    source     text not null default 'csv',
    comment    text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (field_id, total_date)
);

comment on table public.po_field_totals is
    'Production data spine P3: metered field/separator/export totals per field per date (stb, Mscf) — the measurement the P3 Allocation Studio back-allocates across the wells. Upsert key (field_id, total_date).';

create index if not exists po_field_totals_field_date_idx
    on public.po_field_totals (field_id, total_date desc);

alter table public.po_field_totals enable row level security;

drop policy if exists "po_field_totals_select_via_field" on public.po_field_totals;
create policy "po_field_totals_select_via_field"
    on public.po_field_totals for select
    using (exists (
      select 1 from public.po_fields f
      where f.id = po_field_totals.field_id
        and (f.user_id = auth.uid()
             or (f.organization_id is not null and public.is_org_member(f.organization_id)))
    ));

drop policy if exists "po_field_totals_write_own" on public.po_field_totals;
create policy "po_field_totals_write_own"
    on public.po_field_totals for all
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and exists (select 1 from public.po_fields f
                  where f.id = po_field_totals.field_id and f.user_id = auth.uid())
    );
