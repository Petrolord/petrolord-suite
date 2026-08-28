-- Production P11: seed the Production Network Studio tile (fresh slug
-- production-network-studio, templated from the nodal-analysis-engine
-- row so it lands in the Production module).
--
-- The FRESH SLUG IS THE POINT. network-diagram-pro was delisted at P0:
-- a genuinely pleasant drag-and-drop canvas whose Solve button raised a
-- toast, whose Save, Import and Export buttons had no handler at all,
-- and which was listed at 199 dollars and ungated. Per the program's
-- no-revival doctrine that shell stays delisted and its slug stays a
-- redirect; the editor returns INSIDE this studio, which is a different
-- app with a different id and an actual solver behind it.
--
-- %ROWTYPE sibling-copy pattern; idempotent.
--
-- DEPLOY GATE (program-wide single-upload hold, owner directive
-- 2026-08-27, Production-ROADMAP.md §6.6): apply live only with the ONE
-- prod upload that ships the finished Production Operations module,
-- together with the other held P-phase tiles.

do $$
declare
  tmpl public.master_apps%rowtype;
  name_taken boolean;
  v_name text := 'Production Network Studio';
  v_desc text := 'A gathering system solved as one system instead of '
    || 'one well at a time. Every other studio in this module solves a '
    || 'well against a wellhead pressure somebody typed in; in a real '
    || 'network nobody types it in, because the header pressure is '
    || 'whatever the trunk needs to carry the total and the total is '
    || 'what the wells make at that header pressure. So the wells set '
    || 'the pressure that holds the wells back, and this studio says '
    || 'what that costs: what each well makes in the network against '
    || 'what it would make alone through the same lines, solved on the '
    || 'same network with the others shut in so the difference is the '
    || 'other wells and nothing else. Well inflows met against their '
    || 'own tubing, flowlines and trunk on the validated two-phase '
    || 'traverse, nodal mass balance driven to zero by Newton, line '
    || 'mixtures settled by rate rather than by averaging ratios, and '
    || 'the separator pressure swept because it is usually the one '
    || 'thing that can actually be changed tomorrow.';
begin
  select exists (
    select 1 from public.master_apps
    where app_name = v_name and slug <> 'production-network-studio'
  ) into name_taken;

  if exists (select 1 from public.master_apps where slug = 'production-network-studio') then
    update public.master_apps
    set app_name = case when name_taken then app_name else v_name end,
        description = v_desc,
        status = 'Active',
        is_built = true,
        is_functional = true,
        updated_at = now()
    where slug = 'production-network-studio';
    if name_taken then
      raise notice 'app_name % already taken by another slug; rename skipped.', v_name;
    end if;
  else
    select * into tmpl from public.master_apps where slug = 'nodal-analysis-engine' limit 1;
    if tmpl.id is null then
      select * into tmpl from public.master_apps where lower(module) = 'production' limit 1;
    end if;
    if tmpl.id is null then
      raise notice 'no Production template row found; seed skipped.';
      return;
    end if;

    tmpl.id := gen_random_uuid();
    tmpl.slug := 'production-network-studio';
    tmpl.app_name := v_name;
    tmpl.description := v_desc;
    tmpl.status := 'Active';
    tmpl.is_built := true;
    tmpl.is_functional := true;
    tmpl.created_at := now();
    tmpl.updated_at := now();
    select coalesce(max(display_order), 0) + 1 into tmpl.display_order from public.master_apps;

    insert into public.master_apps values (tmpl.*);
  end if;
end $$;
