-- Model of the finalizers on this branch, calling the real manual_verify_quote
-- under test. The RPC gets the paid date and alone sets purchased_modules end
-- dates; the subscription (upsertSuiteSubscription, keyed by org + quote) ends
-- on the later of the paid window and the RPC's expiry_date (provisionedEnd).
create function sub_upsert(q quotes, p_paid timestamptz, r jsonb) returns void language plpgsql as $$
declare e timestamptz := greatest(addm(p_paid, tm(q.billing_period, q.billing_term)), (r->>'expiry_date')::timestamptz); begin
  if exists (select 1 from subscriptions where organization_id = q.organization_id and quote_id = q.id) then
    update subscriptions set start_date = utcdate(p_paid), end_date = utcdate(e), status = 'active' where organization_id = q.organization_id and quote_id = q.id;
  else insert into subscriptions(organization_id, quote_id, start_date, end_date, status) values (q.organization_id, q.id, utcdate(p_paid), utcdate(e), 'active'); end if;
end $$;
-- verify-paystack-payment
create function fin_verify(p_q text, p_paid timestamptz) returns void language plpgsql as $$
declare q quotes; r jsonb; begin
  select * into q from quotes where quote_id = p_q;
  insert into payments values (p_q, 'success', 'success') on conflict (reference) do update set status = 'success', local_status = 'success';
  r := manual_verify_quote(p_q, q.organization_id, p_paid);
  update quotes set payment_verified = true, payment_verified_at = p_paid where id = q.id;
  perform sub_upsert(q, p_paid, r);
end $$;
-- paystack-webhook: skips on 'success' or 'COMPLETED' (paymentAlreadyProcessed),
-- then provisionPaidQuote: RPC with the paid date + the same subscription row.
create function fin_webhook(p_q text, p_paid timestamptz) returns void language plpgsql as $$
declare q quotes; r jsonb; begin
  if exists (select 1 from payments where reference = p_q and (lower(status) in ('success', 'completed') or lower(local_status) in ('success', 'completed'))) then return; end if;
  insert into payments values (p_q, 'COMPLETED', null) on conflict (reference) do update set status = 'COMPLETED';
  select * into q from quotes where quote_id = p_q;
  update quotes set payment_verified = true, payment_verified_at = p_paid where id = q.id;
  r := manual_verify_quote(p_q, q.organization_id, p_paid);
  perform sub_upsert(q, p_paid, r);
end $$;
-- activate-bank-transfer: window from the shared term table, RPC with the
-- approval time, then the subscription end moves to the RPC's end if later.
create function fin_bank(p_q text, p_at timestamptz) returns void language plpgsql as $$
declare q quotes; s subscriptions; r jsonb; e timestamptz; begin
  select * into q from quotes where quote_id = p_q;
  select * into s from subscriptions where quote_id = q.id;
  e := addm(p_at, tm(coalesce(q.billing_period, s.billing_period), coalesce(q.billing_term, s.term)));
  update subscriptions set status = 'active', start_date = utcdate(p_at), end_date = utcdate(e) where id = s.id;
  update quotes set payment_verified = true, payment_verified_at = p_at where id = q.id;
  r := manual_verify_quote(p_q, q.organization_id, p_at);
  update subscriptions set end_date = utcdate(greatest(e, (r->>'expiry_date')::timestamptz)) where id = s.id;
end $$;
