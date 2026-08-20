-- Seismolord Wave 1 / W1.2b: server-side named workspace sessions and
-- viewport bookmarks. One table, two kinds: 'session' rows carry a full
-- workspace snapshot (active volume, orientation/indices, display
-- params, visibility sets, cameras, and the localStorage-backed window/
-- prefs/layout state that used to be browser-only); 'bookmark' rows
-- carry a small navigation point (volume, line, cameras). Payloads are
-- versioned jsonb (payload.v) so future shapes stay additive.
--
-- RLS: user-scoped (auth.uid() = user_id), the seismic_* house pattern.
-- (user_id, kind, name) is unique so "save as" upserts naturally.

create table if not exists public.seismic_sessions (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    kind          text not null default 'session' check (kind in ('session', 'bookmark')),
    name          text not null,
    payload       jsonb not null default '{}',
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.seismic_sessions is
    'Seismolord named workspace sessions (kind=session) and viewport bookmarks (kind=bookmark); payload is a versioned snapshot.';

create unique index if not exists seismic_sessions_user_kind_name_key
    on public.seismic_sessions (user_id, kind, name);
create index if not exists seismic_sessions_user_updated_idx
    on public.seismic_sessions (user_id, updated_at desc);

alter table public.seismic_sessions enable row level security;

drop policy if exists "seismic_sessions_select_own" on public.seismic_sessions;
create policy "seismic_sessions_select_own"
    on public.seismic_sessions for select
    using (auth.uid() = user_id);

drop policy if exists "seismic_sessions_insert_own" on public.seismic_sessions;
create policy "seismic_sessions_insert_own"
    on public.seismic_sessions for insert
    with check (auth.uid() = user_id);

drop policy if exists "seismic_sessions_update_own" on public.seismic_sessions;
create policy "seismic_sessions_update_own"
    on public.seismic_sessions for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "seismic_sessions_delete_own" on public.seismic_sessions;
create policy "seismic_sessions_delete_own"
    on public.seismic_sessions for delete
    using (auth.uid() = user_id);
