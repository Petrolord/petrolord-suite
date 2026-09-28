-- Shared by both finalizer models: the term table of _shared/billing-term.ts
-- (explicit billing_period wins, unknown = 12) and UTC month arithmetic.
create function tm(p_period text, p_term text) returns int language sql immutable as $$
  select coalesce(
    case lower(btrim(coalesce(p_period, ''))) when 'monthly' then 1 when 'quarterly' then 3 when 'annual' then 12 when 'yearly' then 12 when '2year' then 24 when '3year' then 36 end,
    case lower(btrim(coalesce(p_term, ''))) when 'monthly' then 1 when 'quarterly' then 3 when 'annual' then 12 when 'yearly' then 12 when '2year' then 24 when '3year' then 36 end,
    12) $$;
create function addm(p timestamptz, m int) returns timestamptz language sql immutable as $$
  select ((p at time zone 'UTC') + make_interval(months => m)) at time zone 'UTC' $$;
create function utcdate(p timestamptz) returns date language sql immutable as $$ select (p at time zone 'UTC')::date $$;
