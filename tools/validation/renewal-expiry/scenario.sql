\set ON_ERROR_STOP 1
-- Each case uses its own organisation. Dates are payment dates (UTC).
create temp table results(step text, ok boolean, detail text);

-- 1. First purchase, verify page: annual paid 2026-01-15 -> every row ends 2027-01-15, one subscription.
select mkq(1, 'Q1', 'a1:3,a2:2', 'annual'); select fin_verify('Q1', '2026-01-15 10:00Z');
insert into results select '1 first purchase (verify page)', ends(1) = 'a1=2027-01-15, a2=2027-01-15, MOD=2027-01-15' and subs(1) = '1 sub(s): Q1->2027-01-15', ends(1) || ' | ' || subs(1);

-- 2. Renewal before expiry stacks: held to 2027-01-15, renewed annual on 2026-12-01 -> 2028-01-15 (no days lost).
select mkq(2, 'Q2a', 'a1:3,a2:2', 'annual'); select fin_verify('Q2a', '2026-01-15 10:00Z');
select mkq(2, 'Q2b', 'a1:4,a2:2', 'annual'); select fin_verify('Q2b', '2026-12-01 10:00Z');
insert into results select '2 renewal before expiry stacks', ends(2) = 'a1=2028-01-15, a2=2028-01-15, MOD=2028-01-15' and subs(2) = '2 sub(s): Q2a->2027-01-15, Q2b->2028-01-15', ends(2) || ' | ' || subs(2);
insert into results select '2 renewal updates the seat cap (a1 4 seats)', seats_allocated = 4, seats_allocated::text from purchased_modules where organization_id = org(2) and app_id like '%a1';

-- 3. Renewal after expiry: monthly from 2026-02-01 (ended 2026-03-01), renewed annual on 2026-06-10 -> 2027-06-10.
select mkq(3, 'Q3a', 'a1:1', 'monthly'); select fin_verify('Q3a', '2026-02-01 10:00Z');
select mkq(3, 'Q3b', 'a1:1', 'annual'); select fin_verify('Q3b', '2026-06-10 10:00Z');
insert into results select '3 renewal after expiry: from payment date', ends(3) = 'a1=2027-06-10, MOD=2027-06-10', ends(3) || ' | ' || subs(3);

-- 4. Shorter top-up: a1 held annual to 2027-01-15; a monthly quote on 2026-06-01 re-buys a1 and adds a2.
--    a1 stacks to 2027-02-15 (never shortened to 2026-07-01), a2 ends 2026-07-01, the module row keeps its later end.
select mkq(4, 'Q4a', 'a1:3', 'annual'); select fin_verify('Q4a', '2026-01-15 10:00Z');
select mkq(4, 'Q4b', 'a1:5,a2:1', 'monthly'); select fin_verify('Q4b', '2026-06-01 10:00Z');
insert into results select '4 shorter top-up never shortens', ends(4) = 'a1=2027-02-15, a2=2026-07-01, MOD=2027-02-15', ends(4) || ' | ' || subs(4);
--    a new-app-only monthly top-up on the same module: the module row does not move earlier.
select mkq(4, 'Q4c', 'a3:1', 'monthly'); select fin_verify('Q4c', '2026-06-02 10:00Z');
insert into results select '4 new-app top-up leaves module end', ends(4) = 'a1=2027-02-15, a2=2026-07-01, a3=2026-07-02, MOD=2027-02-15', ends(4);

-- 5. Verify page then webhook (renewal before expiry): stacked once, one subscription per quote.
select mkq(5, 'Q5a', 'a1:2', 'annual'); select fin_verify('Q5a', '2026-01-15 10:00Z');
select mkq(5, 'Q5b', 'a1:2', 'annual'); select fin_verify('Q5b', '2026-12-01 10:00Z'); select fin_webhook('Q5b', '2026-12-01 10:00Z');
insert into results select '5 verify then webhook: no wipe, no duplicate', ends(5) = 'a1=2028-01-15, MOD=2028-01-15' and subs(5) = '2 sub(s): Q5a->2027-01-15, Q5b->2028-01-15', ends(5) || ' | ' || subs(5);

-- 6. Webhook then verify page (verify re-runs: it only skips on 'success'): the RPC re-run must not stack twice.
select mkq(6, 'Q6a', 'a1:2', 'annual'); select fin_verify('Q6a', '2026-01-15 10:00Z');
select mkq(6, 'Q6b', 'a1:2', 'annual'); select fin_webhook('Q6b', '2026-12-01 10:00Z'); select fin_verify('Q6b', '2026-12-01 10:00Z');
insert into results select '6 webhook then verify: stacked once', ends(6) = 'a1=2028-01-15, MOD=2028-01-15' and subs(6) = '2 sub(s): Q6a->2027-01-15, Q6b->2028-01-15', ends(6) || ' | ' || subs(6);

-- 7. Webhook only (payer never returns): dates set, subscription row created.
select mkq(7, 'Q7', 'a1:3,a2:2', 'annual'); select fin_webhook('Q7', '2026-01-15 10:00Z');
insert into results select '7 webhook only: dates + subscription', ends(7) = 'a1=2027-01-15, a2=2027-01-15, MOD=2027-01-15' and subs(7) = '1 sub(s): Q7->2027-01-15', ends(7) || ' | ' || subs(7);

-- 8. Bank transfer, quarterly, approved 2026-03-10 -> apps and subscription end 2026-06-10.
select mkq(8, 'Q8', 'a1:2', 'quarterly');
insert into subscriptions(organization_id, quote_id, term, billing_period, status) select org(8), id, 'quarterly', 'quarterly', 'pending' from quotes where quote_id = 'Q8';
select fin_bank('Q8', '2026-03-10 10:00Z');
insert into results select '8 bank transfer (quarterly)', ends(8) = 'a1=2026-06-10, MOD=2026-06-10' and subs(8) = '1 sub(s): Q8->2026-06-10', ends(8) || ' | ' || subs(8);
--    bank-transfer renewal before expiry stacks too, and the subscription follows.
select mkq(8, 'Q8b', 'a1:2', 'quarterly');
insert into subscriptions(organization_id, quote_id, term, billing_period, status) select org(8), id, 'quarterly', 'quarterly', 'pending' from quotes where quote_id = 'Q8b';
select fin_bank('Q8b', '2026-05-20 10:00Z');
insert into results select '8 bank transfer renewal stacks', ends(8) = 'a1=2026-09-10, MOD=2026-09-10' and subs(8) = '2 sub(s): Q8->2026-06-10, Q8b->2026-09-10', ends(8) || ' | ' || subs(8);

-- 9. Month-end parity with addMonths(): monthly paid 2027-01-31 -> 2027-02-28.
select mkq(9, 'Q9', 'a1:1', 'monthly'); select fin_verify('Q9', '2027-01-31 10:00Z');
insert into results select '9 month-end clamp matches addMonths', ends(9) = 'a1=2027-02-28, MOD=2027-02-28' and subs(9) = '1 sub(s): Q9->2027-02-28', ends(9) || ' | ' || subs(9);

-- 10. Transition: a function not yet redeployed calls the two-argument form after marking the quote paid
--     (webhook / bank-transfer order). The wrapper takes the paid date from quotes.payment_verified_at.
select mkq(10, 'Q10a', 'a1:2', 'annual'); select fin_verify('Q10a', '2026-01-15 10:00Z');
select mkq(10, 'Q10b', 'a1:2', 'annual'); update quotes set payment_verified = true, payment_verified_at = '2026-12-01 10:00Z' where quote_id = 'Q10b';
select manual_verify_quote('Q10b', org(10));
insert into results select '10 two-argument form (not yet redeployed) stacks', ends(10) = 'a1=2028-01-15, MOD=2028-01-15', ends(10);

select step, case when ok then 'PASS' else 'FAIL' end res, detail from results order by step;
