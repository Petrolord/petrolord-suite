-- HSE Professional lapse enforcement + Paystack FX config.
--
-- HSE Professional (sold from hse.petrolord.com via the hse-checkout edge fn)
-- is a prepaid term: the grant is organization_apps (app_id 'hse', module_id
-- 'hse_professional'), which has no expiry column. The paired subscriptions
-- row carries end_date; this nightly sweep downgrades lapsed orgs back to
-- hse_free with a 3-day grace period.
--
-- Scope guard: only orgs that have EVER held an hse_professional subscription
-- row are eligible for downgrade — manually comped premium grants (no
-- subscription row) are never touched.

create extension if not exists pg_cron;

select cron.schedule(
  'hse-professional-lapse',
  '15 2 * * *',
  $job$
    update subscriptions
       set status = 'expired', updated_at = now()
     where status = 'active'
       and 'hse_professional' = any(modules)
       and end_date < current_date - 3;

    update organization_apps oa
       set module_id = 'hse_free', seats_allocated = 999
     where oa.app_id = 'hse'
       and oa.module_id = 'hse_professional'
       and exists (
             select 1 from subscriptions s
              where s.organization_id = oa.organization_id
                and 'hse_professional' = any(s.modules))
       and not exists (
             select 1 from subscriptions s
              where s.organization_id = oa.organization_id
                and 'hse_professional' = any(s.modules)
                and s.status = 'active'
                and s.end_date >= current_date - 3);
  $job$
);

-- NGN per USD for the HSE Paystack rail (owner-tunable without redeploy).
insert into pricing_config (key, value)
values ('hse_ngn_per_usd', '1500')
on conflict (key) do nothing;
