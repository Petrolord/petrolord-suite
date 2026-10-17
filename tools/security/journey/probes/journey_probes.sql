-- Guided Journey (20261017100000), probes. Inside the rolled-back dry run only.
-- Personas from tools/security/suite-projects/probes/harness_head.sql.
insert into _ids values ('ORGA', '1ace6b81-f133-4d42-a0fe-56960e8d71ed') on conflict do nothing;
insert into _ids values ('CONS', '1d5bc4bf-5bf3-4349-8319-b20e9ffb1c39') on conflict do nothing;
insert into _ids select 'ORGB', organization_id::text from public.organization_members
  where user_id = '19db244f-eb02-461a-b6f9-813d65c8e259' and coalesce(lower(status), 'active') = 'active' limit 1 on conflict do nothing;
create function pg_temp.id(k text) returns uuid language sql stable as $$ select v::uuid from _ids where _ids.k = id.k $$;
grant execute on all functions in schema pg_temp to public;

-- the record starts empty and the state still answers
select pg_temp.t('consultant', 'no journey row yet: state says missing', $$select public.suite_journey_state() -> 'journey' ->> 'missing'$$, 'true');
select pg_temp.t('consultant', 'org is the consultant''s organisation', $$select (public.suite_journey_state() -> 'org' ->> 'id') = pg_temp.id('ORGA')::text$$, 'true');
select pg_temp.t('consultant', 'team size counts active members', $$select ((public.suite_journey_state() -> 'org' ->> 'member_count')::int = (select count(*) from public.organization_members where organization_id = pg_temp.id('ORGA') and coalesce(lower(status), 'active') = 'active'))::text$$, 'true');
select pg_temp.t('consultant', 'real projects exclude the default one', $$select ((public.suite_journey_state() -> 'projects' ->> 'real')::int = (select count(*) from public.suite_projects where owner_user_id = auth.uid() and not is_default and status = 'active'))::text$$, 'true');
select pg_temp.t('consultant', 'the name comes back', $$select (public.suite_journey_state() -> 'user' ->> 'email') = 'ayoasaolu@gmail.com'$$, 'true');

-- disciplines decide which apps are probed
select pg_temp.t('consultant', 'choose drilling only', $$select public.suite_journey_set(null, array['drilling']) ->> 'disciplines_source'$$, 'chosen');
select pg_temp.t('consultant', 'drilling only: no seismic in the state', $$select (public.suite_journey_state() -> 'work' ? 'seismolord')::text$$, 'false');
select pg_temp.t('consultant', 'drilling only: every app probed is drilling', $$select count(*)::text from jsonb_each(public.suite_journey_state() -> 'work') w where w.value ->> 'discipline' <> 'drilling'$$, '0');
select pg_temp.t('consultant', 'drilling only: Well Design Studio is probed', $$select (public.suite_journey_state() -> 'work' ? 'well-planning')::text$$, 'true');
select pg_temp.t('consultant', 'choose geoscience and economics', $$select array_to_string(array(select jsonb_array_elements_text(public.suite_journey_set(null, array['economics', 'geoscience', 'geoscience']) -> 'disciplines')), ',')$$, 'economics,geoscience');
select pg_temp.t('consultant', 'geoscience and economics: nothing else probed', $$select count(*)::text from jsonb_each(public.suite_journey_state() -> 'work') w where w.value ->> 'discipline' not in ('geoscience', 'economics')$$, '0');
select pg_temp.t('consultant', 'seismic work equals the tables (own rows)', $$select ((public.suite_journey_state() -> 'work' -> 'seismolord' ->> 'any')::boolean
   = (exists (select 1 from public.seismic_volumes where user_id = auth.uid()) or exists (select 1 from public.seismic_lines where user_id = auth.uid())
      or exists (select 1 from public.seismic_projects where user_id = auth.uid())))::text$$, 'true');
select pg_temp.t('consultant', 'a project holding wells reads in_project true', $$with p as (select suite_project_id id from public.geo_wells where suite_project_id is not null limit 1)
  select coalesce(((public.suite_journey_state((select id from p)) -> 'work' -> 'well-data-manager' ->> 'in_project')::boolean = true)::text, 'no project with wells')$$, 'true');
insert into _ids values ('PE', pg_temp.run('consultant', $$insert into public.suite_projects (organization_id, owner_user_id, name, visibility)
  values (pg_temp.id('ORGA'), auth.uid(), 'Probe journey empty project', 'members') returning id::text$$));
select pg_temp.t('consultant', 'a new empty project reads in_project false', $$select (public.suite_journey_state(pg_temp.id('PE')) -> 'work' -> 'well-data-manager' ->> 'in_project')$$, 'false');
select pg_temp.t('consultant', 'a new empty project counts as a real project', $$select ((public.suite_journey_state() -> 'projects' ->> 'real')::int >= 1)::text$$, 'true');
select pg_temp.t('consultant', 'named apps: exactly those two', $$select (select string_agg(k, ',' order by k) from jsonb_object_keys(public.suite_journey_state(null, array['well-planning', 'qra-studio']) -> 'work') k)$$, 'qra-studio,well-planning');
select pg_temp.t('consultant', 'a created_by source answers (process safety)', $$select (public.suite_journey_state(null, array['qra-studio']) -> 'work' -> 'qra-studio' ->> 'any') in ('true', 'false')$$, 'true');

-- validation
select pg_temp.t('consultant', 'an unknown discipline is refused', $$select public.suite_journey_set(null, array['astrology'])::text$$, 'ERR 22023');
select pg_temp.t('consultant', 'an unknown guidance mode is refused', $$select public.suite_journey_set('loud')::text$$, 'ERR 22023');
select pg_temp.t('consultant', 'quiet mode', $$select public.suite_journey_set('quiet') ->> 'guidance'$$, 'quiet');
select pg_temp.t('consultant', 'quiet mode records when', $$select ((public.suite_journey_state() -> 'journey' ->> 'guidance_changed_at') is not null)::text$$, 'true');
select pg_temp.t('consultant', 'a prompt answered once', $$select (public.suite_journey_mark('acknowledged', 'after_first:geoscience') -> 'acknowledged') ? 'after_first:geoscience'$$, 'true');
select pg_temp.t('consultant', 'answering again keeps one entry', $$select count(*)::text from jsonb_object_keys(public.suite_journey_mark('acknowledged', 'after_first:geoscience') -> 'acknowledged')$$, '1');
select pg_temp.t('consultant', 'a malformed step key is refused', $$select public.suite_journey_mark('dismissed', 'Bad Key!')::text$$, 'ERR 22023');
select pg_temp.t('consultant', 'an unknown mark is refused', $$select public.suite_journey_mark('hacked', 'x')::text$$, 'ERR 22023');
select pg_temp.t('consultant', 'welcome to own organisation recorded', $$select jsonb_array_length(public.suite_journey_mark('welcomed_org', pg_temp.id('ORGA')::text) -> 'welcomed_orgs')::text$$, '1');
select pg_temp.t('consultant', 'recording it again keeps one', $$select jsonb_array_length(public.suite_journey_mark('welcomed_org', pg_temp.id('ORGA')::text) -> 'welcomed_orgs')::text$$, '1');
select pg_temp.t('consultant', 'welcome to another organisation is refused', $$select public.suite_journey_mark('welcomed_org', pg_temp.id('ORGB')::text)::text$$, 'ERR 42501');
select pg_temp.t('consultant', 'greeted stamps the time', $$select ((public.suite_journey_mark('greeted', null) ->> 'last_greeted_at') is not null)::text$$, 'true');

-- privacy and writes
select pg_temp.t('consultant', 'reads own row', $$select count(*)::text from public.suite_user_journey where user_id = auth.uid()$$, '1');
select pg_temp.t('member', 'a colleague cannot read the consultant''s row', $$select count(*)::text from public.suite_user_journey where user_id = pg_temp.id('CONS')$$, '0');
select pg_temp.t('member', 'a colleague''s own journey starts missing', $$select public.suite_journey_state() -> 'journey' ->> 'missing'$$, 'true');
select pg_temp.t('member', 'no direct insert', $$insert into public.suite_user_journey (user_id) values (auth.uid())$$, 'ERR 42501');
select pg_temp.t('member', 'no direct update', $$update public.suite_user_journey set guidance = 'quiet' where user_id = auth.uid()$$, 'ERR 42501');
select pg_temp.t('member', 'no writes to the sources', $$insert into public.suite_journey_work_sources values ('x', 'x', 'drilling', 'case', 'user_id', null)$$, 'ERR 42501');
select pg_temp.t('member', 'reads the sources', $$select (count(*) > 50)::text from public.suite_journey_work_sources$$, 'true');
select pg_temp.t('orgB', 'another organisation cannot read the consultant''s row', $$select count(*)::text from public.suite_user_journey$$, '0');
select pg_temp.t('orgB', 'its state names its own organisation', $$select (public.suite_journey_state() -> 'org' ->> 'id') = pg_temp.id('ORGB')::text$$, 'true');
select pg_temp.t('noorg', 'no organisation: org is empty', $$select (public.suite_journey_state() ->> 'org') is null$$, 'true');
select pg_temp.t('demo', 'the demo account gets a state', $$select jsonb_typeof(public.suite_journey_state() -> 'work')$$, 'object');
select pg_temp.t('anon', 'anon cannot ask for a state', $$select public.suite_journey_state()::text$$, 'ERR 42501');
select pg_temp.t('anon', 'anon cannot read journeys', $$select count(*)::text from public.suite_user_journey$$, 'ERR 42501');
select pg_temp.t('anon', 'anon cannot write', $$select public.suite_journey_set('quiet')::text$$, 'ERR 42501');
select pg_temp.t('member', 'the row probe refuses a table that is not a work source', $$select public.suite_journey_has_row('organizations', 'id', auth.uid())::text$$, 'ERR 22023');
select pg_temp.t('member', 'the row probe refuses an unlisted column of a source', $$select public.suite_journey_has_row('geo_wells', 'organization_id', auth.uid())::text$$, 'ERR 22023');
