-- R1 — Decline Curve Analysis persistence (Reservoir-ROADMAP.md §3).
--
-- The live database already carries a `saved_dca_projects` table (an
-- out-of-band legacy creation: 0 rows, RLS enabled, owner-scoped ALL
-- policy + an admin-claim policy; it is even referenced by
-- get_all_my_projects() already) — but the repo had NO migration for
-- it and the DCA app never wrote to it (localStorage/IndexedDB only,
-- the R0 audit's persistence gap). This migration canonicalizes the
-- table in the repo and aligns it to the saved_<app>_projects
-- convention (the waterflood pattern):
--   * create-if-not-exists with the LIVE shape (no-op live; makes a
--     fresh environment reproducible),
--   * results_data becomes nullable (results are a pure function of
--     inputs; the client stores the payload in inputs_data),
--   * updated_at added (the app auto-saves; list orders by it),
--   * owner index + owner-scoped policies ensured (existing live
--     policies are already owner-equivalent and are left in place).

create table if not exists public.saved_dca_projects (
    id                 uuid primary key default gen_random_uuid(),
    user_id            uuid not null references auth.users (id) on delete cascade,
    project_name       text not null,
    inputs_data        jsonb not null,
    results_data       jsonb,
    original_file_data text,
    file_name          text,
    created_at         timestamptz not null default now()
);

alter table public.saved_dca_projects
  alter column results_data drop not null;

alter table public.saved_dca_projects
  add column if not exists updated_at timestamptz not null default now();

create index if not exists saved_dca_projects_user_id_idx
    on public.saved_dca_projects (user_id, updated_at desc);

alter table public.saved_dca_projects enable row level security;

-- Owner-scoped policy (idempotent). The live table already carries
-- "Users can manage their own data" (ALL, auth.uid() = user_id) and an
-- admin-claim policy; this guarantees the owner policy exists in fresh
-- environments without disturbing the live ones.
drop policy if exists "dca_owner_all" on public.saved_dca_projects;
create policy "dca_owner_all"
    on public.saved_dca_projects for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
