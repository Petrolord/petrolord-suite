-- EPE Monte Carlo runs (D2, docs/scope/Economics-ROADMAP.md).
-- Persists probabilistic runs produced by the epe-monte-carlo edge function:
-- the distribution config that was run and the summarized results (NPV
-- percentiles/CDF, P(NPV>0), IRR stats, fan bands, tornado swings, seed).
-- Raw per-iteration samples are NOT stored.
--
-- Product-prefixed epe_* table; owner-scoped RLS matching the existing EPE
-- tables (auth.uid() = user_id). Idempotent.

create table if not exists public.epe_mc_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.epe_cases(id) on delete cascade,
  run_config_id uuid references public.epe_run_configs(id) on delete set null,
  user_id uuid not null,
  mc_config jsonb not null default '{}'::jsonb,
  results jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists epe_mc_runs_case_id_idx on public.epe_mc_runs (case_id);
create index if not exists epe_mc_runs_user_id_idx on public.epe_mc_runs (user_id);

alter table public.epe_mc_runs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.epe_mc_runs'::regclass
      and polname = 'Users can manage their own EPE MC runs'
  ) then
    create policy "Users can manage their own EPE MC runs"
      on public.epe_mc_runs
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
