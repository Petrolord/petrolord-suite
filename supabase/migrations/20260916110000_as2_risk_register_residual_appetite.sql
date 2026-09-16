-- AS2 — residual risk, appetite, review dates, and risk codes that do
-- not collide (Assurance-ROADMAP.md §3 app 1).
--
-- Four things the register needs and did not have.
--
-- 1. RESIDUAL RISK. The register scored inherent risk only. Every
--    dashboard number, every heatmap cell and every "critical risks"
--    count therefore described the world before any control was
--    applied, which is not the number anyone manages against.
--    `residual_score` is GENERATED, and it falls back PER AXIS to the
--    inherent level, because mitigation that reduces likelihood but not
--    impact is the common case and must not silently reset impact to 1.
--    This expression has to stay in step with calculateResidualScore()
--    in src/lib/riskScoring.js; the app test suite pins the pairing.
--
-- 2. APPETITE. `appetite_status` already existed as a free text column
--    and was null on every row, because nothing ever wrote it and
--    nothing defined it. `target_score` gives it a meaning: the score
--    this organization is willing to carry for this risk. Status is
--    derived, never typed, and a risk with no target reads "Not set"
--    rather than reporting a pass it has not earned.
--
-- 3. REVIEW DATES. `risk_reviews.next_review_date` existed on the child
--    table, so a risk's next review was only knowable by joining to its
--    most recent review, and a risk never reviewed had no due date at
--    all. The register carries its own.
--
-- 4. RISK CODES THAT COLLIDE. The app minted codes as
--    `RSK-${Math.floor(Math.random() * 10000)}`. With 10,000 codes,
--    two risks share one at about 118 risks by the birthday bound, with
--    nothing to stop it: there was no unique constraint. People cite
--    risk codes in audits. `next_risk_code()` issues them in sequence
--    per organization and the unique index makes a duplicate loud.
--
-- The four live rows were checked first: RSK-1001 to RSK-1004, no
-- duplicates, so the unique index is safe to add.
--
-- Additive and idempotent. The front end works before and after: it
-- calls next_risk_code and falls back to a client-side maximum while
-- the function is absent, and it omits the new columns when they are
-- not there yet.

begin;

-- ---------------------------------------------------------------
-- 1. Residual, appetite, review date
-- ---------------------------------------------------------------
alter table public.risk_register
  add column if not exists residual_likelihood integer,
  add column if not exists residual_impact     integer,
  add column if not exists target_score        integer,
  add column if not exists next_review_date    date;

do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_register_residual_likelihood_check'
                    and conrelid = 'public.risk_register'::regclass) then
    alter table public.risk_register
      add constraint risk_register_residual_likelihood_check
      check (residual_likelihood is null
             or (residual_likelihood >= 1 and residual_likelihood <= 5));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_register_residual_impact_check'
                    and conrelid = 'public.risk_register'::regclass) then
    alter table public.risk_register
      add constraint risk_register_residual_impact_check
      check (residual_impact is null
             or (residual_impact >= 1 and residual_impact <= 5));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_register_target_score_check'
                    and conrelid = 'public.risk_register'::regclass) then
    alter table public.risk_register
      add constraint risk_register_target_score_check
      check (target_score is null or (target_score >= 1 and target_score <= 25));
  end if;
end $$;

-- Generated, so it can never drift from the levels it describes. This
-- is the same treatment risk_score already had, and the reason `rating`
-- beside it is the column that CAN drift (AS2 writes it from the one
-- scoring authority on every save).
do $$ begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public'
                    and table_name = 'risk_register'
                    and column_name = 'residual_score') then
    alter table public.risk_register
      add column residual_score integer
      generated always as (
        coalesce(residual_likelihood, likelihood) * coalesce(residual_impact, impact)
      ) stored;
  end if;
end $$;

comment on column public.risk_register.residual_score is
  'Generated: residual level times residual level, falling back PER AXIS to the inherent level. Must stay in step with calculateResidualScore() in src/lib/riskScoring.js (AS2).';
comment on column public.risk_register.target_score is
  'The score this organization is willing to carry for this risk. appetite_status is derived from residual_score against it, never typed (AS2).';

-- ---------------------------------------------------------------
-- 2. Risk codes: unique per organization, issued in sequence
-- ---------------------------------------------------------------
create unique index if not exists risk_register_org_code_uniq
  on public.risk_register (org_id, risk_id);

create or replace function public.next_risk_code(p_org uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_next integer;
begin
  -- The caller must be a member of the organization it is asking about.
  -- SECURITY DEFINER without this check would be a way to count another
  -- tenant's risks.
  if not (p_org = public.my_org_id() or public.is_super_admin()) then
    raise exception 'not a member of that organization' using errcode = '42501';
  end if;

  -- Serialize issuance per organization. Without the lock, two people
  -- creating a risk at the same moment both read the same maximum and
  -- the second one hits the unique index.
  perform pg_advisory_xact_lock(hashtext('risk_code' || p_org::text));

  select coalesce(max((regexp_replace(risk_id, '\D', '', 'g'))::integer), 1000) + 1
    into v_next
    from public.risk_register
   where org_id = p_org
     and risk_id ~ '^RSK-[0-9]+$';

  return 'RSK-' || lpad(v_next::text, 4, '0');
end;
$$;

revoke all on function public.next_risk_code(uuid) from public, anon;
grant execute on function public.next_risk_code(uuid) to authenticated;

comment on function public.next_risk_code(uuid) is
  'Issues the next sequential RSK- code for an organization, under an advisory lock. Replaces a client-side Math.random() over 10,000 values that collided by the birthday bound at about 118 risks (AS2).';

commit;
