-- Module pricing: one source of truth, in the database.
--
-- WHY. Before this there were FOUR numbers for the same thing and they all
-- disagreed: src/data/pricingModels.js (geoscience 899),
-- src/pages/GetQuote.jsx (500), admin/.../QuoteEditor.jsx (500), and the
-- generate-quote edge function, which ignored all three and charged a
-- HARDCODED FLAT 500 for every module regardless of which module it was.
--
-- Because a purchased module grants every app whose module_id matches, that
-- flat 500 bought 10 to 14 apps that cost 5,990 to 11,988 a month a la
-- carte. Selecting a module and no apps was a 92-96 percent discount, and
-- it was reachable from the public quote page.
--
-- Pricing now lives here, is read by generate-quote (server is
-- authoritative), and can be changed by the owner without a code deploy.
--
-- THE RULE BEHIND THE NUMBERS: a module costs about 3.3x its own per-app
-- price, so it costs roughly what three apps cost and delivers ten to
-- fourteen. That keeps the bundle the obvious purchase, keeps a la carte a
-- genuine convenience premium for someone who wants two tools, and makes
-- the discount legible instead of accidental.
--
-- HSE is deliberately absent: it is the separate external portal, billed in
-- naira through hse_ngn_per_usd, not a Suite module.
--
-- Idempotent. Safe: issued quotes store their own total_amount and
-- pricing_breakdown, so nothing already sent to a customer changes.

insert into public.pricing_config (key, value)
values (
  'module_pricing',
  '{"geoscience":2999,"drilling":3299,"reservoir":3299,"facilities":2499,"production":2499,"economics":1999,"midstream-downstream":1999,"assurance":1499}'
)
on conflict (key) do update set value = excluded.value;

-- The a la carte per-app price stays on master_apps.price and is unchanged
-- by this migration. Recorded here so the relationship is not a mystery:
--   geoscience 899, drilling 899, reservoir 699-899, facilities 699,
--   production 699, economics 599, midstream-downstream 599, assurance 499.
