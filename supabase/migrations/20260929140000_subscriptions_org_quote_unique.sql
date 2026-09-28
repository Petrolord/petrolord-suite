-- 20260929140000_subscriptions_org_quote_unique
--
-- One subscriptions row per (organization_id, quote_id). Owner approved 2026-09-28.
--
-- Every writer (_shared/provision-quote.ts Suite + HSE, verify-bank-transfer)
-- selects by org + quote, then updates or inserts. Two finalizers for the same
-- quote (verify page + webhook, a double proof upload) can both see "no row"
-- and both insert. This index makes the second insert fail with 23505; the
-- writers (_shared/subscription-write.ts) then update the winner's row.
--
-- Plain (non-partial) unique index so PostgREST onConflict could infer it.
-- NULL quote_id values stay distinct, so rows without a quote are unaffected.
-- Not CONCURRENTLY: it runs inside the owner's begin/commit wrapper (the table
-- is tiny: 1 row on 2026-09-28).
--
-- Guard: if duplicate (org, quote) pairs exist, raise naming them so the apply
-- fails cleanly. This migration never deletes or changes data.
-- Idempotent: the guard is read-only and the index uses IF NOT EXISTS.
-- No begin/commit lines here: the owner's apply script wraps it.

do $$
declare
  dupes text;
begin
  select string_agg(format('(%s, %s) x%s', organization_id, quote_id, n), '; ' order by organization_id, quote_id)
    into dupes
  from (
    select organization_id, quote_id, count(*) as n
    from public.subscriptions
    where quote_id is not null and organization_id is not null
    group by organization_id, quote_id
    having count(*) > 1
  ) d;
  if dupes is not null then
    raise exception 'subscriptions has duplicate (organization_id, quote_id) pairs; resolve them by hand before adding subscriptions_org_quote_key: %', dupes;
  end if;
end
$$;

create unique index if not exists subscriptions_org_quote_key
  on public.subscriptions (organization_id, quote_id);

comment on index public.subscriptions_org_quote_key is
  'One subscription per (organization, quote). Writers catch 23505 here and update the existing row (supabase/functions/_shared/subscription-write.ts). NULL quote_id rows are not constrained.';
