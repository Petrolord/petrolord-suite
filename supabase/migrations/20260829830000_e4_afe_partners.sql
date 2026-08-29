-- Economics E4 — AFE joint-venture partners.
--
-- The JV Partner Management tab held its partners in React state only, and
-- seeded that state with two invented companies ("Partner A Corp" at 30
-- percent and "Partner B Ltd" at 15 percent). Every user opening the tab met
-- the same two fictional partners, could generate a billing statement against
-- them, and lost anything they typed on reload.
--
-- Partners belong to an AFE and are cost-allocation data, so they get a
-- table. Owner-scoped through the parent AFE, which is how the rest of the
-- afe_* family is scoped. Safe pre-deploy, idempotent.

create table if not exists public.afe_partners (
    id uuid primary key default gen_random_uuid(),
    afe_id uuid not null references public.afes(id) on delete cascade,
    name text not null,
    working_interest numeric not null default 0,
    partner_type text not null default 'Non-Operator',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists afe_partners_afe_id_idx on public.afe_partners(afe_id);

alter table public.afe_partners enable row level security;

do $$
begin
    begin
        -- Scoped through the parent AFE: you can see and change the partners
        -- of an AFE you own, and no others.
        create policy "Users can manage partners on their own AFEs"
            on public.afe_partners for all
            using (
                exists (
                    select 1 from public.afes a
                    where a.id = afe_partners.afe_id and a.user_id = auth.uid()
                )
            )
            with check (
                exists (
                    select 1 from public.afes a
                    where a.id = afe_partners.afe_id and a.user_id = auth.uid()
                )
            );
    exception when duplicate_object then null;
    end;
end $$;
