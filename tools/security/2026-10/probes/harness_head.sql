-- Probe harness head (2026-10). Used ONLY inside BEGIN ... ROLLBACK (see run_dryrun.sh).
-- Personas: anon; member (Lordsway engineer); org admin (Lordsway admin);
-- platform admin (ayoasaolu@gmail.com); org B member (Lekki school) aiming at org A;
-- demo account (Petrolord Demo owner). Read-only except inserts that the rollback discards.
create temp table _p (phase text, persona text, probe text, result text) on commit drop;
grant all on _p to public;
create temp table _personas (persona text, uid uuid, email text) on commit drop;
grant all on _personas to public;
insert into _personas values
  ('anon', null, null),
  ('member', '02dbca6c-7816-4b74-972c-be4fbd6e2753', 'woledada1@gmail.com'),
  ('orgadmin', '0b403d59-ea61-4809-9429-a692bca9214b', 'seyiojo@lordswayenergy.com'),
  ('platform', '1d5bc4bf-5bf3-4349-8319-b20e9ffb1c39', 'ayoasaolu@gmail.com'),
  ('orgB', '19db244f-eb02-461a-b6f9-813d65c8e259', 'ndifreke.usoro@peculiarschools.com'),
  ('demo', '77aad664-c819-4611-b479-a2f55dc17460', 'demo@petrolord.com');

create function pg_temp.q(p_sql text) returns text language plpgsql as $f$
declare r text;
begin
  if p_sql ~* '^\s*(insert|update|delete)\M' and p_sql !~* '\mreturning\M' then
    execute p_sql;
    return 'OK';
  end if;
  execute p_sql into r;
  return coalesce(r, 'NULL');
exception when others then
  return 'ERR ' || sqlstate;
end $f$;

-- become a persona (transaction-local)
create function pg_temp.become(p text) returns void language plpgsql as $f$
declare v uuid; e text;
begin
  select uid, email into v, e from _personas where persona = p;
  if p = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', v, 'role', 'authenticated', 'email', e)::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end $f$;

-- count every small public table as each persona
create function pg_temp.snapshot(p_phase text) returns void language plpgsql as $f$
declare t text; p text;
begin
  for p in select persona from _personas loop
    for t in select c.relname from pg_class c
              where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v')
                and c.reltuples < 200000 and c.relname not in ('spatial_ref_sys')
              order by 1 loop
      perform pg_temp.become(p);
      insert into _p values (p_phase, p, 'count:' || t,
        pg_temp.q(format('select count(*)::text from public.%I', t)));
      reset role;
      perform set_config('request.jwt.claims', '', true);
    end loop;
  end loop;
end $f$;
grant execute on all functions in schema pg_temp to public;

set local statement_timeout = '600s';
select pg_temp.snapshot('before');
