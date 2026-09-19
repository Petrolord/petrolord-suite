-- Behavioural probe for Migration B on live data: every row with an owner
-- must stay visible to that owner, and a stranger must see none of it.
-- Run only INSIDE a rollback-wrapped dry run (apply.sh does), after A and
-- B. Prints counts only, never row contents or ids.
create temp table if not exists _sec_owner(k text, v text) on commit drop;
truncate _sec_owner;
do $$
declare
  r record; seen bigint; owned bigint;
  lost int; checked int;
  stranger constant text := '00000000-0000-0000-0000-0000000000ff';
  q record;
begin
  for q in select * from (values
      ('portfolios',              'select distinct user_id::text u from public.portfolios',                                      'select count(*) from public.portfolios where user_id::text = $1'),
      ('portfolio_projects',      'select distinct user_id::text u from public.portfolio_projects',                              'select count(*) from public.portfolio_projects where user_id::text = $1'),
      ('pm_deliverables',         'select distinct p.user_id::text u from public.pm_deliverables d join public.projects p on p.id = d.project_id', 'select count(*) from public.pm_deliverables d join public.projects p on p.id = d.project_id where p.user_id::text = $1'),
      ('safety_moment_views',     'select distinct user_id::text u from public.safety_moment_views',                             'select count(*) from public.safety_moment_views where user_id::text = $1'),
      ('safety_moment_downloads', 'select distinct user_id::text u from public.safety_moment_downloads',                         'select count(*) from public.safety_moment_downloads where user_id::text = $1')
    ) as v(tn, owners_sql, owned_sql)
  loop
    lost := 0; checked := 0;
    for r in execute q.owners_sql loop
      execute q.owned_sql into owned using r.u;             -- as postgres: ground truth
      perform set_config('request.jwt.claim.sub', r.u, true);
      perform set_config('request.jwt.claims', json_build_object('sub', r.u, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      execute format('select count(*) from public.%I', q.tn) into seen;
      execute 'reset role';
      checked := checked + 1;
      if seen < owned then lost := lost + 1; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', stranger, true);
    perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    execute format('select count(*) from public.%I', q.tn) into seen;
    execute 'reset role';
    insert into _sec_owner values (q.tn, format('owners checked %s, owners who lost rows %s, stranger sees %s', checked, lost, seen));
  end loop;

  -- catalogue tables: any signed-in user reads them
  perform set_config('request.jwt.claim.sub', stranger, true);
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  for q in select unnest(array['templates','badge_definitions','apps']) tn loop
    execute 'set local role authenticated';
    execute format('select count(*) from public.%I', q.tn) into seen;
    execute 'reset role';
    insert into _sec_owner values (q.tn || ' (stranger)', seen::text);
  end loop;

  -- dead tables: a signed-in user is refused outright
  begin
    execute 'set local role authenticated';
    select count(*) into seen from public.payment_audit_log;
    execute 'reset role';
    insert into _sec_owner values ('payment_audit_log (authenticated)', 'READABLE ' || seen);
  exception when insufficient_privilege then
    execute 'reset role';
    insert into _sec_owner values ('payment_audit_log (authenticated)', 'denied');
  end;
end $$;
select k as probe, v as result from _sec_owner order by 1;
