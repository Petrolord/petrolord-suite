\set ON_ERROR_STOP 1
create temp table results(step text, ok boolean, detail text);
-- the finalizer's sync (verify-paystack-payment / provision-quote / now webhook + bank transfer)
create temp table sync_log(q uuid, e timestamptz);
-- (a) first purchase, paid 2026-01-01 annual -> end 2027-01-01
insert into results select 'a.rpc', (r->>'status')='success', r::text from (select manual_verify_quote('QT-FIRST','00000000-0000-0000-0000-00000000000a') r) x;
update purchased_modules set expiry_date='2027-01-01Z' where organization_id='00000000-0000-0000-0000-00000000000a' and quote_id='00000000-0000-0000-0000-0000000000f1';
insert into results select 'a.first purchase: all rows end 2027-01-01', bool_and(expiry_date='2027-01-01Z') and count(*)=3, string_agg(coalesce(app_id,'MODULE')||'='||coalesce(expiry_date::text,'NULL'),', ') from purchased_modules where module_id<>'hse_free';
-- (b) renewal Q2, paid 2026-12-20 annual -> end 2027-12-20
insert into results select 'b.rpc', (r->>'status')='success', r::text from (select manual_verify_quote('QT-RENEW','00000000-0000-0000-0000-00000000000a') r) x;
update purchased_modules set expiry_date='2027-12-20Z' where organization_id='00000000-0000-0000-0000-00000000000a' and quote_id='00000000-0000-0000-0000-0000000000f2';
insert into results select 'b.renewal: all 4 rows end 2027-12-20 on QT-RENEW', bool_and(expiry_date='2027-12-20Z' and quote_id='00000000-0000-0000-0000-0000000000f2') and count(*)=4,
  string_agg(coalesce(app_id,'MODULE')||'='||coalesce(expiry_date::text,'NULL')||' q='||right(coalesce(quote_id::text,'-'),2),', ' order by app_id) from purchased_modules;
insert into results select 'b.renewal: seat cap updated (mbal 4)', seats_allocated=4, seats_allocated::text from purchased_modules where app_id='00000000-0000-0000-0000-0000000000a1';
-- (c) second RPC run for the same quote with no sync after it (Paystack webhook after redirect verify)
select manual_verify_quote('QT-RENEW','00000000-0000-0000-0000-00000000000a');
insert into results select 'c.re-run keeps 2027-12-20', bool_and(expiry_date='2027-12-20Z'), string_agg(coalesce(expiry_date::text,'NULL'),', ') from purchased_modules;
select step, case when ok then 'PASS' else 'FAIL' end res, detail from results order by step;
