-- Model of the finalizers on origin/main (what production runs today), calling
-- the real manual_verify_quote under test. One SQL function per rail.
-- verify-paystack-payment: RPC, quote paid, subscription (org, quote) with the
-- paid window, then the expiry sync on rows WHERE quote_id = the paid quote.
create function fin_verify(p_q text, p_paid timestamptz) returns void language plpgsql as $$
declare q quotes; e timestamptz; begin
  select * into q from quotes where quote_id = p_q;
  insert into payments values (p_q, 'success', 'success') on conflict (reference) do update set status = 'success', local_status = 'success';
  perform manual_verify_quote(p_q, q.organization_id);
  update quotes set payment_verified = true, payment_verified_at = p_paid where id = q.id;
  e := addm(p_paid, tm(q.billing_period, q.billing_term));
  if exists (select 1 from subscriptions where organization_id = q.organization_id and quote_id = q.id) then
    update subscriptions set start_date = utcdate(p_paid), end_date = utcdate(e), status = 'active' where organization_id = q.organization_id and quote_id = q.id;
  else insert into subscriptions(organization_id, quote_id, start_date, end_date, status) values (q.organization_id, q.id, utcdate(p_paid), utcdate(e), 'active'); end if;
  update purchased_modules set expiry_date = e where organization_id = q.organization_id and quote_id = q.id;
end $$;
-- paystack-webhook (Suite branch): skips only on payments.status 'COMPLETED';
-- RPC; no expiry sync, no subscription row.
create function fin_webhook(p_q text, p_paid timestamptz) returns void language plpgsql as $$
declare q quotes; begin
  if exists (select 1 from payments where reference = p_q and status = 'COMPLETED') then return; end if;
  insert into payments values (p_q, 'COMPLETED', null) on conflict (reference) do update set status = 'COMPLETED';
  select * into q from quotes where quote_id = p_q;
  update quotes set payment_verified = true, payment_verified_at = p_paid where id = q.id;
  perform manual_verify_quote(p_q, q.organization_id);
end $$;
-- activate-bank-transfer: the pending subscription gets start today and end
-- +1 month if monthly else +1 year; RPC; no expiry sync.
create function fin_bank(p_q text, p_at timestamptz) returns void language plpgsql as $$
declare q quotes; s subscriptions; begin
  select * into q from quotes where quote_id = p_q;
  select * into s from subscriptions where quote_id = q.id;
  update subscriptions set status = 'active', start_date = utcdate(p_at),
    end_date = utcdate(addm(p_at, case when coalesce(s.billing_period, '') = 'monthly' or s.term ilike '%month%' then 1 else 12 end)) where id = s.id;
  update quotes set payment_verified = true, payment_verified_at = p_at where id = q.id;
  perform manual_verify_quote(p_q, q.organization_id);
end $$;
