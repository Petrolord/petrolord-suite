-- Material Balance Studio: backfill of the one rb_* object that is live and
-- was in no migration file.
--
-- FILENAME IS DELIBERATELY BACK-DATED (authored 2026-10-02, MBAL-U1): it must
-- sort after 20260718220000_backfill_rb_tables_ddl.sql, which creates
-- rb_run_configs, and it describes an object that predates this repo's
-- migration history, like that file.
--
-- What it captures (live catalog read on 2026-10-02 with read-only SELECTs on
-- pg_trigger and pg_proc; nothing was changed):
--
--   trigger   update_rb_run_configs_updated_at
--             BEFORE UPDATE ON public.rb_run_configs FOR EACH ROW
--             EXECUTE FUNCTION update_updated_at_column()
--   function  public.update_updated_at_column()  returns trigger, plpgsql:
--             NEW.updated_at = NOW(); RETURN NEW;
--
-- 20260718220000 captured the five tables, their constraints, indexes and
-- policies from pg_attribute, pg_constraint, pg_indexes and pg_policies. It
-- did not read pg_trigger, so this trigger and its function were missed: a
-- database rebuilt from the repo would keep rb_run_configs.updated_at at its
-- insert time for ever, while the live one moves it on every update.
--
-- The sister trigger update_rb_cases_updated_at (same function, on rb_cases)
-- was live until 2026-10-02 and is NOT recreated here:
-- 20261002130000_reservoir_record_sharing.sql drops it, because its guard
-- trigger stamps rb_cases.updated_at on a change of content only. On a
-- rebuild that drop is the no-op it is written to be.
--
-- APPLYING THIS FILE TO THE LIVE DATABASE CHANGES NOTHING: the function is
-- created only when no function of that name and signature exists, and the
-- trigger only when rb_run_configs has no trigger of that name. Both exist
-- live, so both branches are skipped. On a fresh rebuild it creates both.
-- Idempotent. No data is read or written. No shared table is touched.
--
-- Why "create only when absent" and never CREATE OR REPLACE: the function
-- name is a generic one and other live tables may fire it. Replacing its
-- body from here could change their behaviour; leaving an existing one alone
-- cannot.

do $$
begin
    if not exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'update_updated_at_column'
          and p.pronargs = 0
    ) then
        execute $fn$
            create function public.update_updated_at_column()
            returns trigger
            language plpgsql
            as $body$
            begin
                new.updated_at = now();
                return new;
            end;
            $body$
        $fn$;
    end if;

    if not exists (
        select 1
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'rb_run_configs'
          and t.tgname = 'update_rb_run_configs_updated_at'
          and not t.tgisinternal
    ) then
        create trigger update_rb_run_configs_updated_at
            before update on public.rb_run_configs
            for each row execute function public.update_updated_at_column();
    end if;
end $$;
