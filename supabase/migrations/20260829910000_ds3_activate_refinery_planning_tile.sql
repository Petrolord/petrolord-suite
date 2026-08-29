-- Midstream & Downstream DS3 — Refinery Planning & Scheduling goes Active (HELD).
--
-- DEPLOY GATE: apply only with the prod upload that ships the DS3 build.

do $$
declare
  v_slug text := 'refinery-planning-scheduling';
begin
  if not exists (select 1 from public.master_apps where slug = v_slug) then
    raise notice 'Tile % not present; run the DS0 module seed first. Nothing done.', v_slug;
    return;
  end if;

  update public.master_apps
  set status = 'Active',
      is_built = true,
      is_functional = true,
      description = 'The plan, the schedule and the actuals on ONE data model, which is '
        || 'what makes variance a subtraction rather than a reconciliation project. A '
        || 'configuration-level linear programme chooses crude runs and unit rates to '
        || 'maximise margin under a material balance on every stream, then cascades to a '
        || 'calendar of cargoes, unit runs and lifts. Recorded actuals are the same shape '
        || 'as plan events, so the gap decomposes exactly into a volume part and a price '
        || 'part, with unmatched movements listed rather than folded in. Reports the '
        || 'marginal value of every stream, which prices a debottleneck before anyone '
        || 'spends on one.',
      updated_at = now()
  where slug = v_slug;
end $$;
