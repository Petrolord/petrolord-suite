-- catalog fingerprint of what P0 touches (as the migration role)
create function pg_temp.catalog(p_phase text) returns void language plpgsql as $f$
begin
  insert into _p select p_phase, 'catalog', 'policies:' || tablename,
         md5(string_agg(policyname || permissive || roles::text || cmd || coalesce(qual,'') || coalesce(with_check,''), '|' order by policyname))
    from pg_policies where schemaname in ('public','storage')
     and (tablename like 'geo\_%' or tablename like 'seismic\_%' or tablename like 'strat\_%' or tablename = 'objects')
   group by tablename;
  insert into _p select p_phase, 'catalog', 'columns:' || table_name,
         md5(string_agg(column_name || data_type, ',' order by column_name))
    from information_schema.columns where table_schema = 'public'
     and (table_name like 'geo\_%' or table_name like 'seismic\_%' or table_name like 'strat\_%')
   group by table_name;
  insert into _p values (p_phase, 'catalog', 'suite_tables',
         (select count(*)::text from pg_class where relnamespace = 'public'::regnamespace and relname in
           ('suite_clients','suite_projects','suite_project_members','suite_project_access_log','suite_user_state')));
  insert into _p values (p_phase, 'catalog', 'suite_functions',
         (select count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and
           (proname like 'suite\_project%' or proname like 'suite\_client%' or proname like 'suite\_org\_%'
            or proname in ('suite_log','suite_is_client','suite_default_project_as','suite_move_to_project'))));
  insert into _p values (p_phase, 'catalog', 'triggers',
         (select md5(string_agg(c.relname || t.tgname || t.tgenabled::text, ',' order by c.relname, t.tgname)) from pg_trigger t
            join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
             and (c.relname like 'geo\_%' or c.relname like 'seismic\_%' or c.relname like 'strat\_%')));
end $f$;
grant execute on all functions in schema pg_temp to public;
select pg_temp.catalog('before');
