-- Production P9: the Artificial Lift Designer becomes the Artificial
-- Lift Advisor.
--
-- The SLUG DELIBERATELY DOES NOT CHANGE. Unlike every other P-phase
-- tile migration, this one renames a row rather than seeding a fresh
-- one, because `artificial-lift-designer` is a live Active tile that
-- entitlements and pricing already reference. Seeding a new slug and
-- archiving the old one would break access for anyone who has it.
--
-- What changed underneath: P0 stripped the app to its screening matrix
-- after finding its three design tabs silently wrong; P4, P5 and P6
-- rebuilt those designs properly as their own studios; P9 turns what
-- was left into an advisor that runs all four of them against one
-- shared well record. The name follows the app.
--
-- Idempotent.
--
-- DEPLOY GATE (program-wide single-upload hold, owner directive
-- 2026-08-27, Production-ROADMAP.md §6.6): apply live only with the ONE
-- prod upload that ships the finished Production Operations module,
-- together with the other held P-phase tiles.

do $$
declare
  name_taken boolean;
  v_name text := 'Artificial Lift Advisor';
  v_desc text := 'Which lift method suits a well, answered twice. A '
    || 'screening matrix across gas lift, ESP, rod pump, plunger lift, '
    || 'progressing cavity and jet pumps, with every rule of thumb '
    || 'spelled out rather than hidden in a score. Then the real thing: '
    || 'the validated design chain for each of the four methods this '
    || 'Suite can design, run against one shared well record, so the '
    || 'answer is what each would actually need on THIS well. Where '
    || 'the screening and the design disagree, both are shown and the '
    || 'design is named as the one that solved the well.';
begin
  select exists (
    select 1 from public.master_apps
    where app_name = v_name and slug <> 'artificial-lift-designer'
  ) into name_taken;

  if not exists (select 1 from public.master_apps where slug = 'artificial-lift-designer') then
    raise notice 'artificial-lift-designer row not found; nothing to rename.';
    return;
  end if;

  update public.master_apps
  set app_name = case when name_taken then app_name else v_name end,
      description = v_desc,
      status = 'Active',
      is_built = true,
      is_functional = true,
      updated_at = now()
  where slug = 'artificial-lift-designer';

  if name_taken then
    raise notice 'app_name % already taken by another slug; rename skipped, description still updated.', v_name;
  end if;
end $$;
