-- AS3 — the Regulatory Compliance schema: obligations that carry their
-- own regime, expiry and evidence (Assurance-ROADMAP.md §3 app 2).
--
-- Two things at once, because the state of this app needs both.
--
-- 1. BACKFILL. `regulatory_obligations` and `regulatory_authorities`
--    exist ONLY in the live database. They did not match AS1's
--    `^(risk_|moc_|doc_|compliance_)` sweep, which is why AS1b had to
--    come back for their anon grants, and they were not in AS1's schema
--    backfill either. They are declared here so the module can be
--    rebuilt from the repo, on the same rb_* precedent AS1 used.
--
--    Both tables are EMPTY in production (read live 2026-09-16, AS1b),
--    so nothing below can reclassify a row an organization already has.
--
-- 2. THE COLUMNS THE APP NEEDS. The register knew a title, a facility,
--    a due date, a status and an authority. That is a to-do list. A
--    compliance obligation register has to answer, for a real audit:
--    under which regime and jurisdiction, against which permit or
--    licence number, how often, when does the permit EXPIRE (which is
--    not the same date as the next report being due), who owns it, what
--    happens if it is missed, and what evidence was filed last time.
--
--    `expiry_date` is the one worth naming twice. A permit's expiry and
--    a report's due date are different obligations against the same
--    row, and an app that stores one date cannot tell an operator that
--    their discharge permit lapses in three weeks. That is the failure
--    mode this whole app exists to prevent.
--
-- ENVIRONMENTAL COMPLIANCE FOLDS IN HERE. Per §3 of the roadmap, the
-- separate Environmental Compliance tile is retired and environmental
-- obligations are a `regime` value on this register, not a second thin
-- app with its own half of the truth.
--
-- STATUS IS DERIVED, NEVER TYPED. The existing `status` text column is
-- exactly the `rating` situation AS2 found on risk_register: an
-- ordinary text column that whichever client last wrote it decides, and
-- which then disagrees with the dates beside it. The lifecycle an
-- operator actually chooses (Active / Draft / Superseded / Not
-- applicable) moves to `lifecycle`; `status` stays as the cached
-- derivation and is rewritten from src/lib/complianceStatus.js on every
-- save. `complianceStatus.test.js` pins the pairing.
--
-- Additive and idempotent. Safe to re-run.

begin;

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------
-- 1. The two existing tables, declared
-- ---------------------------------------------------------------
-- `create table if not exists` is a no-op against production, where
-- both already exist; the `add column if not exists` blocks below are
-- what actually upgrade them. On an empty database these create the
-- whole shape.

create table if not exists public.regulatory_authorities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null,
  acronym text,
  jurisdiction text,
  contact_name text,
  email text,
  phone text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.regulatory_obligations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  authority_id uuid references public.regulatory_authorities(id) on delete set null,
  owner_id uuid,
  title text not null,
  facility text,
  due_date date,
  status text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- ---------------------------------------------------------------
-- 2. The columns the register was missing
-- ---------------------------------------------------------------

alter table public.regulatory_authorities
  add column if not exists website    text,
  add column if not exists notes      text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamp with time zone default now(),
  add column if not exists updated_at timestamp with time zone default now();

alter table public.regulatory_obligations
  add column if not exists obligation_code    text,
  add column if not exists description        text,
  add column if not exists regime             text,
  add column if not exists obligation_type    text,
  add column if not exists jurisdiction       text,
  add column if not exists reference          text,
  add column if not exists frequency          text,
  add column if not exists lifecycle          text default 'Active',
  add column if not exists effective_date     date,
  add column if not exists expiry_date        date,
  add column if not exists last_submitted_date date,
  add column if not exists lead_time_days     integer default 30,
  add column if not exists consequence        text,
  add column if not exists notes              text,
  add column if not exists created_by         uuid,
  add column if not exists created_at         timestamp with time zone default now(),
  add column if not exists updated_at         timestamp with time zone default now();

comment on column public.regulatory_obligations.expiry_date is
  'When the permit, licence or consent itself lapses. NOT the same date as due_date, which is when the next submission or action falls due. An app that stores only one of the two cannot warn an operator that a permit is about to expire (AS3).';
comment on column public.regulatory_obligations.status is
  'DERIVED and cached. Computed by src/lib/complianceStatus.js from the dates, the lifecycle and last_submitted_date, and rewritten on every save. Never typed by a user; the user sets `lifecycle`. Same treatment risk_register.rating got in AS2.';
comment on column public.regulatory_obligations.regime is
  'The regulatory regime: Environmental, Health & Safety, Operational, Licensing, Reporting, Financial, Other. The retired Environmental Compliance tile folds in here as a regime value rather than a second app (Assurance-ROADMAP.md §3).';
comment on column public.regulatory_obligations.lead_time_days is
  'How many days before due_date or expiry_date this obligation starts reading "Due soon". Per obligation, because a 90-day permit renewal and a 7-day incident notification are not the same warning.';

-- Vocabularies. Checks rather than enums: an operator in a jurisdiction
-- we have not met should not need a migration to file an obligation,
-- so each list ends in 'Other' and null is always allowed.
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'regulatory_obligations_lifecycle_check'
                    and conrelid = 'public.regulatory_obligations'::regclass) then
    alter table public.regulatory_obligations
      add constraint regulatory_obligations_lifecycle_check
      check (lifecycle is null or lifecycle in
             ('Active', 'Draft', 'Superseded', 'Not applicable'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'regulatory_obligations_regime_check'
                    and conrelid = 'public.regulatory_obligations'::regclass) then
    alter table public.regulatory_obligations
      add constraint regulatory_obligations_regime_check
      check (regime is null or regime in
             ('Environmental', 'Health & Safety', 'Operational',
              'Licensing', 'Reporting', 'Financial', 'Other'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'regulatory_obligations_type_check'
                    and conrelid = 'public.regulatory_obligations'::regclass) then
    alter table public.regulatory_obligations
      add constraint regulatory_obligations_type_check
      check (obligation_type is null or obligation_type in
             ('Permit', 'Licence', 'Consent', 'Periodic report',
              'Inspection', 'Fee or levy', 'Notification', 'Other'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'regulatory_obligations_frequency_check'
                    and conrelid = 'public.regulatory_obligations'::regclass) then
    alter table public.regulatory_obligations
      add constraint regulatory_obligations_frequency_check
      check (frequency is null or frequency in
             ('One-off', 'Monthly', 'Quarterly', 'Semi-annual',
              'Annual', 'Biennial', 'Other'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'regulatory_obligations_lead_time_check'
                    and conrelid = 'public.regulatory_obligations'::regclass) then
    alter table public.regulatory_obligations
      add constraint regulatory_obligations_lead_time_check
      check (lead_time_days is null
             or (lead_time_days >= 0 and lead_time_days <= 1095));
  end if;
  -- An obligation that expires before it takes effect is a typo, and it
  -- would read as permanently expired on the register.
  if not exists (select 1 from pg_constraint
                  where conname = 'regulatory_obligations_effective_before_expiry_check'
                    and conrelid = 'public.regulatory_obligations'::regclass) then
    alter table public.regulatory_obligations
      add constraint regulatory_obligations_effective_before_expiry_check
      check (effective_date is null or expiry_date is null
             or effective_date <= expiry_date);
  end if;
end $$;

-- ---------------------------------------------------------------
-- 3. Evidence: what makes "Compliant" mean anything
-- ---------------------------------------------------------------
-- Without this table, "Compliant" is a word somebody typed. With it,
-- an obligation is compliant for the current period because a dated
-- submission with a reference exists for that period, and the register
-- can be handed to an auditor.

create table if not exists public.regulatory_evidence (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null
    references public.regulatory_obligations(id) on delete cascade,
  period_label text,
  submitted_date date not null,
  submitted_by uuid,
  reference text,
  file_url text,
  notes text,
  created_at timestamp with time zone default now()
);

create index if not exists regulatory_evidence_obligation_idx
  on public.regulatory_evidence (obligation_id, submitted_date desc);

comment on table public.regulatory_evidence is
  'Dated submissions against an obligation: the filing, its reference and where the document lives. regulatory_obligations.last_submitted_date is the most recent of these (AS3).';

-- ---------------------------------------------------------------
-- 4. Obligation codes: unique per organization, issued in sequence
-- ---------------------------------------------------------------
-- Same treatment, and the same reason, as next_risk_code in AS2: people
-- cite these references in correspondence with a regulator, so two
-- obligations must never share one.

create index if not exists regulatory_obligations_org_idx
  on public.regulatory_obligations (org_id, due_date);
create index if not exists regulatory_authorities_org_idx
  on public.regulatory_authorities (org_id, name);

create unique index if not exists regulatory_obligations_org_code_uniq
  on public.regulatory_obligations (org_id, obligation_code)
  where obligation_code is not null;

create or replace function public.next_obligation_code(p_org uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_next integer;
begin
  -- SECURITY DEFINER without this check would be a way to count another
  -- tenant's obligations.
  if not (p_org = public.my_org_id() or public.is_super_admin()) then
    raise exception 'not a member of that organization' using errcode = '42501';
  end if;

  -- Serialize issuance per organization, or two people filing at the
  -- same moment both read the same maximum and the second one hits the
  -- unique index.
  perform pg_advisory_xact_lock(hashtext('obligation_code' || p_org::text));

  select coalesce(max((regexp_replace(obligation_code, '\D', '', 'g'))::integer), 1000) + 1
    into v_next
    from public.regulatory_obligations
   where org_id = p_org
     and obligation_code ~ '^REG-[0-9]+$';

  return 'REG-' || lpad(v_next::text, 4, '0');
end;
$$;

revoke all on function public.next_obligation_code(uuid) from public, anon;
grant execute on function public.next_obligation_code(uuid) to authenticated;

comment on function public.next_obligation_code(uuid) is
  'Issues the next sequential REG- code for an organization, under an advisory lock (AS3, on the next_risk_code precedent).';

-- ---------------------------------------------------------------
-- 5. RLS on the new child, and the parents' policies tightened
-- ---------------------------------------------------------------
-- AS1b took anon's grants away from the two parents. Their policies are
-- still `for all to public` via is_org_member(), which works but leans
-- on auth.uid() being null to hold anon out. AS1's shape is explicit:
-- `to authenticated`, scoped by my_org_id(), super admin honoured.

-- The two parent revokes are AS1b's, repeated here deliberately. They
-- are idempotent, and repeating them means AS3 does not depend on AS1b
-- having been applied first: the pentest beside this migration proves
-- the posture of the app as a whole, not of one migration.
revoke all on table
  public.regulatory_obligations,
  public.regulatory_authorities,
  public.regulatory_evidence
from anon;
grant select, insert, update, delete on table
  public.regulatory_obligations,
  public.regulatory_authorities,
  public.regulatory_evidence
to authenticated;

alter table public.regulatory_authorities enable row level security;
alter table public.regulatory_obligations enable row level security;
alter table public.regulatory_evidence    enable row level security;

drop policy if exists "Org Access Authorities" on public.regulatory_authorities;
drop policy if exists regulatory_authorities_org_rw on public.regulatory_authorities;
create policy regulatory_authorities_org_rw on public.regulatory_authorities
  for all to authenticated
  using (org_id = public.my_org_id() or public.is_super_admin())
  with check (org_id = public.my_org_id() or public.is_super_admin());

drop policy if exists "Org Access Obligations" on public.regulatory_obligations;
drop policy if exists regulatory_obligations_org_rw on public.regulatory_obligations;
create policy regulatory_obligations_org_rw on public.regulatory_obligations
  for all to authenticated
  using (org_id = public.my_org_id() or public.is_super_admin())
  with check (org_id = public.my_org_id() or public.is_super_admin());

-- The child carries no org_id, so it scopes through its parent.
drop policy if exists regulatory_evidence_org_rw on public.regulatory_evidence;
create policy regulatory_evidence_org_rw on public.regulatory_evidence
  for all to authenticated
  using (
    public.is_super_admin() or exists (
      select 1 from public.regulatory_obligations o
       where o.id = regulatory_evidence.obligation_id
         and o.org_id = public.my_org_id()
    )
  )
  with check (
    public.is_super_admin() or exists (
      select 1 from public.regulatory_obligations o
       where o.id = regulatory_evidence.obligation_id
         and o.org_id = public.my_org_id()
    )
  );

commit;
