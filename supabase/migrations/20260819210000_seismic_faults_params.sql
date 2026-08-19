-- Seismolord fault-stick import (follow-on to PR #189).
--
-- seismic_faults gains the same provenance home seismic_horizons has:
-- a params jsonb. Imported faults record their source there
-- (params.source = {file_name, format, rows, placed, skipped,
-- dropped_sticks, z_sign}), mirroring the horizon pick-import shape;
-- hand-picked faults keep the empty default. No RLS change — the four
-- own-row policies cover the new column.

alter table public.seismic_faults
    add column if not exists params jsonb not null default '{}'::jsonb;

comment on column public.seismic_faults.params is
    'Interpretation parameters/provenance (import source etc.), the seismic_horizons.params shape. Empty for hand-picked faults.';
