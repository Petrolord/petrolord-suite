-- Reservoir Simulation Studio, Step 1 of the Reservoir upgrade round
-- (SIM-U1-005; docs/upgrade/ReservoirSimulationStudio-UPGRADE.md).
--
-- The Model Builder form is saved with the case. Before, it lived in
-- component state only: a reload, a tab switch or a colleague opening the
-- case lost it, so a generated deck could not be traced to its inputs.
--
-- One nullable jsonb column on a product-prefixed table. No shared table is
-- touched, no policy changes: sim_cases is already under the record-sharing
-- rules (20261002130000_reservoir_record_sharing.sql, applied), so the
-- column is read by whoever can read the case and written by the owner, or
-- by a colleague while holding the check-out of a case shared for editing;
-- the guard trigger stamps the version on a change, as for every other
-- column. Existing rows keep NULL ("no form saved"); nothing is backfilled.
--
-- The app works before this is applied: it saves the form to a JSON file
-- beside the deck in the sim bucket ({owner id}/{case id}/builder/form.json,
-- owner only, under the existing storage policies) and says that a colleague
-- cannot save it until this column exists.
--
-- Idempotent. Apply staging first; log in MIGRATIONS.md.

alter table public.sim_cases
    add column if not exists builder_form jsonb;

comment on column public.sim_cases.builder_form is
  'Reservoir Simulation Studio Model Builder form saved with the case (formVersion inside; pvt-1 and kr-1 intakes, identification, last generated deck SHA-256). NULL: no form saved.';
