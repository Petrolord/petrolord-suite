-- Seismolord Wave 2 / W2.1: derived (attribute) volumes. A derived
-- volume is a full brick store on the PARENT'S lattice (geometry copied
-- verbatim into its v2 manifest) computed by the client-side volume job
-- (envelope, instantaneous phase/frequency, sweetness, windowed RMS,
-- AGC). These columns carry the provenance the explorer and pickers
-- group by; the manifest remains the authoritative geometry record.
--
-- Additive only; existing rows keep kind 'seismic'. RLS: existing
-- user-scoped policies on seismic_volumes already cover these columns;
-- no policy changes. parent deletion sets the link null rather than
-- cascading — a derived volume renders standalone (its manifest embeds
-- the geometry), and cascading the ROW would orphan its storage bricks.

alter table public.seismic_volumes
    add column if not exists kind text not null default 'seismic',
    add column if not exists parent_volume_id uuid references public.seismic_volumes(id) on delete set null,
    add column if not exists attribute_params jsonb;

create index if not exists seismic_volumes_parent_idx
    on public.seismic_volumes (parent_volume_id)
    where parent_volume_id is not null;

comment on column public.seismic_volumes.kind is
    '''seismic'' = ingested SEG-Y; ''attribute'' = derived volume computed from parent_volume_id (manifest v2).';
comment on column public.seismic_volumes.parent_volume_id is
    'Parent volume a derived volume was computed from. Null for ingested volumes, or when the parent was deleted (the child stays usable — its manifest embeds the geometry).';
comment on column public.seismic_volumes.attribute_params is
    'Derived volumes: {name, params} of the attribute recipe (engine ATTRIBUTE_DEFS key + tunables). Null for ingested volumes.';
