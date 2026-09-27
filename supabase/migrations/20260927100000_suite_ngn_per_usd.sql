-- Suite Paystack rail: naira per US dollar (owner-tunable, no redeploy).
--
-- Suite quotes are priced in USD and paid on Paystack in naira. Until
-- 2026-09-27 generate-quote sent the USD total as if it were naira. The fix
-- (supabase/functions/_shared/paystack-ngn.ts) converts at this rate, falling
-- back to hse_ngn_per_usd and then 1500 while this row is absent, so the code
-- is safe before this is applied. Seeded at the HSE rate so both products
-- charge the same until the owner moves one. Data only, idempotent.
insert into pricing_config (key, value)
values ('suite_ngn_per_usd', '1500')
on conflict (key) do nothing;
