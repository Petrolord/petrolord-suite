-- AS10 — Audit & Findings Manager tile (HELD).
--
-- A SEED, not a promotion: this app is new. AS1 archived the two
-- Active, sellable tiles that had no code of any kind behind them —
-- `safety-audit-manager` and `audit-trail-manager` — and recorded that
-- they would be rebuilt together here as one app that seeds its own
-- tile. This is that tile.
--
-- It is seeded as **Coming Soon**, not Active, for the reason F12
-- recorded: a tile must never go Active before its route is on the
-- deploy target. The promotion to Active is held with the rest of the
-- module's promotions, to be applied with the upload that ships AS10.
--
-- %ROWTYPE sibling copy off a live Assurance row, so the module,
-- pricing and module_id come from a real neighbour rather than being
-- typed. Idempotent.

do $$
declare
  tmpl public.master_apps%rowtype;
  name_taken boolean;
  v_slug text := 'audit-findings-manager';
  v_name text := 'Audit & Findings Manager';
  v_desc text := 'The audit programme an operator runs outside its '
    || 'management system: contractor and supplier audits, HSE and '
    || 'permit-to-work audits, process and operational audits, each '
    || 'executed against a reusable checklist rather than against the '
    || 'clauses of a standard. An audit will not report with its '
    || 'checklist half blank, and "not applicable" is an answer that '
    || 'carries a reason, because that is how a protocol nobody had '
    || 'time to finish gets emptied. A critical question answered '
    || 'nonconformant has to raise a finding with a number, an owner '
    || 'and a due date before the audit can be issued. A finding that '
    || 'stopped work records what was done about it at the time, not '
    || 'at closure. Findings carry to closure through correction, root '
    || 'cause and a corrective action verified effective, in the same '
    || 'words the ISO Compliance app uses, so the two can be counted '
    || 'together. And an annual programme is complete when its audits '
    || 'are reported or cancelled with a reason, not when the year '
    || 'ends.';

begin
  select exists (
    select 1 from public.master_apps
    where app_name = v_name and slug <> v_slug
  ) into name_taken;

  if exists (select 1 from public.master_apps where slug = v_slug) then
    update public.master_apps
    set app_name = case when name_taken then app_name else v_name end,
        description = v_desc,
        status = 'Coming Soon',
        is_built = true,
        is_functional = false,
        updated_at = now()
    where slug = v_slug;
    if name_taken then
      raise notice 'app_name % already taken by another slug; rename skipped.', v_name;
    end if;
  else
    select * into tmpl from public.master_apps
      where slug = 'risk-register' limit 1;
    if tmpl.id is null then
      select * into tmpl from public.master_apps
        where lower(module) = 'assurance' and status = 'Active' limit 1;
    end if;
    if tmpl.id is null then
      raise notice 'no Assurance template row found; seed skipped.';
      return;
    end if;

    tmpl.id := gen_random_uuid();
    tmpl.slug := v_slug;
    tmpl.app_name := v_name;
    tmpl.description := v_desc;
    tmpl.status := 'Coming Soon';
    tmpl.is_built := true;
    tmpl.is_functional := false;
    tmpl.created_at := now();
    tmpl.updated_at := now();
    select coalesce(max(display_order), 0) + 1 into tmpl.display_order from public.master_apps;

    insert into public.master_apps values (tmpl.*);
  end if;
end $$;
