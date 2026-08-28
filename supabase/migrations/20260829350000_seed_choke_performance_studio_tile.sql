-- Production P8: seed the Choke & Wellhead Performance Studio tile
-- (fresh slug choke-performance-studio, templated from the
-- nodal-analysis-engine row so it lands in the Production module). The
-- archived shells it replaces (Choke Sizing Calculator, Operating
-- Envelope) were archived at P0 and are never revived.
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
  v_name text := 'Choke & Wellhead Performance Studio';
  v_desc text := 'Choke sizing and rating as a constraint inside the '
    || 'nodal solve rather than a calculation beside it: a bean size '
    || 'becomes a rate on the real well, the operating envelope shows '
    || 'every bean and marks where the flow stops being critical, the '
    || 'API RP 14E erosional limit carries its C factor as an input '
    || 'because the practice itself calls its values conservative, gas '
    || 'chokes report the Joule-Thomson cooling with a labelled '
    || 'hydrate screening, and the Gilbert-family coefficients can be '
    || 'fitted to the well''s own tests instead of a published set.';
begin
  select exists (
    select 1 from public.master_apps
    where app_name = v_name and slug <> 'choke-performance-studio'
  ) into name_taken;

  if exists (select 1 from public.master_apps where slug = 'choke-performance-studio') then
    update public.master_apps
    set app_name = case when name_taken then app_name else v_name end,
        description = v_desc,
        status = 'Active',
        is_built = true,
        is_functional = true,
        updated_at = now()
    where slug = 'choke-performance-studio';
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
    tmpl.slug := 'choke-performance-studio';
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
