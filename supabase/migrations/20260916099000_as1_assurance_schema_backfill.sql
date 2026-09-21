-- AS1 — the Assurance schema, backfilled into the repo
-- (Assurance-ROADMAP.md §4.1 item 3.)
--
-- Every Assurance table exists ONLY in the live database. No migration
-- in this repo creates any of them, so the module cannot be rebuilt
-- from the repo and its RLS posture was unauditable from source until
-- the AS1 audit read it off production directly.
--
-- This is the same backfill the rb_* Material Balance tables got
-- (2844fc324). Generated from the live catalog on 2026-09-16 and
-- rewritten as IF NOT EXISTS / guarded constraints, so it is a no-op
-- against production and a full rebuild anywhere else.
--
-- It is deliberately a FAITHFUL transcription, warts included. Two of
-- the warts are recorded here because later waves fix them and should
-- not "discover" them again:
--
--   * risk_register.risk_score is a STORED GENERATED column,
--     `(likelihood * impact)`, so the score itself is safe: it tracks
--     edits to likelihood and impact. `rating` beside it is NOT. It is
--     an ordinary text column written by whichever client last touched
--     the row, so the band can disagree with the score it is supposed
--     to describe. AS2 gives rating one computed authority too.
--   * `documents`, `risks` and `actions` are unprefixed names that
--     predate the product-prefix convention. They are not renamed under
--     this programme, but nothing new joins them.
--
-- RLS and grants for these tables are in
-- 20260916101000_as1_assurance_rls.sql, which must run after this.
--
-- One limit worth knowing before running it anywhere but production:
-- `create table if not exists` will not ADD a column to a table that
-- already exists with a different shape, and the guarded constraints
-- below would then fail on the missing column. Against production it is
-- a pure no-op, because every line was generated from production. On any
-- other database, start from an empty schema.

begin;

-- Some of these tables default their id with uuid_generate_v4() and
-- others with gen_random_uuid(); both spellings are transcribed as
-- found, so the extension has to be declared.
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------

create table if not exists public.risk_actions (
  id uuid default gen_random_uuid() not null,
  risk_id uuid,
  action_owner_id uuid,
  title text not null,
  description text,
  status text default 'Open'::text,
  due_date date,
  created_at timestamp with time zone default now()
);

create table if not exists public.risk_activity_log (
  id uuid default gen_random_uuid() not null,
  risk_id uuid,
  user_id uuid,
  action text not null,
  details jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.risk_attachments (
  id uuid default gen_random_uuid() not null,
  risk_id uuid,
  file_name text not null,
  file_url text not null,
  uploaded_by uuid,
  uploaded_at timestamp with time zone default now()
);

create table if not exists public.risk_comments (
  id uuid default gen_random_uuid() not null,
  risk_id uuid,
  user_id uuid,
  comment_text text not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.risk_kris (
  id uuid default gen_random_uuid() not null,
  risk_id uuid not null,
  name text not null,
  description text,
  frequency text,
  threshold_warning numeric,
  threshold_critical numeric,
  current_value numeric,
  unit text,
  status text,
  updated_at timestamp with time zone default now()
);

create table if not exists public.risk_links (
  id uuid default gen_random_uuid() not null,
  source_risk_id uuid not null,
  target_risk_id uuid not null,
  link_type text not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.risk_mitigation_actions (
  id uuid default gen_random_uuid() not null,
  risk_id uuid not null,
  description text not null,
  strategy text,
  owner_id uuid,
  status text default 'Not Started'::text,
  start_date date,
  due_date date,
  completion_date date,
  progress integer default 0,
  budget numeric,
  spent numeric,
  effectiveness text,
  created_at timestamp with time zone default now()
);

create table if not exists public.risk_register (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  risk_id text not null,
  title text not null,
  description text,
  category text not null,
  status text default 'Open'::text,
  likelihood integer,
  impact integer,
  risk_score integer generated always as ((likelihood * impact)) stored,
  rating text,
  owner_id uuid,
  root_cause text,
  consequences text,
  appetite_status text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by uuid,
  mitigation_summary text
);

create table if not exists public.risk_register_snapshots (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  name text not null,
  description text,
  snapshot_data jsonb not null,
  created_by uuid,
  created_at timestamp with time zone default now()
);

create table if not exists public.risk_reviews (
  id uuid default gen_random_uuid() not null,
  risk_id uuid,
  reviewer_id uuid,
  review_date timestamp with time zone default now(),
  comments text,
  next_review_date date
);

create table if not exists public.risk_scenarios (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  title text not null,
  description text,
  type text,
  probability text,
  impact_financial numeric,
  created_at timestamp with time zone default now()
);

create table if not exists public.risk_tags (
  id uuid default gen_random_uuid() not null,
  risk_id uuid not null,
  tag text not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.compliance_audits (
  id uuid default gen_random_uuid() not null,
  org_id uuid,
  framework_id uuid,
  auditor_id uuid,
  audit_date date,
  score numeric,
  status text,
  report_url text,
  created_at timestamp with time zone default now()
);

create table if not exists public.compliance_frameworks (
  id uuid default gen_random_uuid() not null,
  org_id uuid,
  name text not null,
  description text,
  version text,
  is_active boolean default true
);

create table if not exists public.compliance_requirements (
  id uuid default gen_random_uuid() not null,
  framework_id uuid,
  section_ref text,
  description text not null,
  mandatory boolean default true,
  status text default 'not_started'::text
);

create table if not exists public.compliance_rules (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  name text not null,
  description text,
  severity text,
  frequency text,
  assigned_department_ids uuid[],
  responsible_person_id uuid,
  due_date date,
  status text default 'Active'::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.doc_activity_log (
  id uuid default uuid_generate_v4() not null,
  document_id uuid,
  user_id uuid,
  action text not null,
  details jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.doc_categories (
  id uuid default uuid_generate_v4() not null,
  org_id uuid not null,
  name text not null,
  code text not null,
  description text,
  created_at timestamp with time zone default now()
);

create table if not exists public.doc_comments (
  id uuid default uuid_generate_v4() not null,
  document_id uuid,
  revision_id uuid,
  user_id uuid not null,
  content text not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.doc_distribution (
  id uuid default uuid_generate_v4() not null,
  document_id uuid,
  user_id uuid,
  department text,
  distributed_at timestamp with time zone default now(),
  acknowledged_at timestamp with time zone
);

create table if not exists public.doc_revisions (
  id uuid default uuid_generate_v4() not null,
  document_id uuid,
  revision_number text not null,
  changes_description text,
  file_url text,
  file_name text,
  file_size bigint,
  status text default 'Draft'::text,
  created_by uuid,
  created_at timestamp with time zone default now(),
  approved_at timestamp with time zone
);

create table if not exists public.doc_workflows (
  id uuid default uuid_generate_v4() not null,
  revision_id uuid,
  reviewer_id uuid not null,
  role text not null,
  status text default 'Pending'::text,
  comments text,
  due_date date,
  completed_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

create table if not exists public.documents (
  id uuid default uuid_generate_v4() not null,
  org_id uuid not null,
  document_number text not null,
  title text not null,
  category_id uuid,
  department text,
  owner_id uuid,
  status text default 'Draft'::text,
  confidentiality text default 'Internal'::text,
  current_revision text default '01'::text,
  project_id uuid,
  asset_id uuid,
  issue_date date,
  next_review_date date,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.moc_actions (
  id uuid default gen_random_uuid() not null,
  moc_id uuid not null,
  action_type text not null,
  description text not null,
  assigned_to uuid,
  due_date date,
  status text default 'Open'::text,
  completed_at timestamp with time zone,
  closure_comments text,
  created_at timestamp with time zone default now()
);

create table if not exists public.moc_activity_log (
  id uuid default gen_random_uuid() not null,
  moc_id uuid not null,
  actor_id uuid,
  action text not null,
  details jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.moc_approvals (
  id uuid default gen_random_uuid() not null,
  moc_id uuid not null,
  approver_id uuid not null,
  role text,
  level integer default 1,
  status text default 'Pending'::text,
  comments text,
  decision_date timestamp with time zone,
  created_at timestamp with time zone default now()
);

create table if not exists public.moc_comments (
  id uuid default gen_random_uuid() not null,
  moc_id uuid not null,
  user_id uuid not null,
  comment_text text not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.moc_impacts (
  id uuid default gen_random_uuid() not null,
  moc_id uuid not null,
  impact_area text not null,
  description text,
  severity text,
  mitigation text,
  created_at timestamp with time zone default now()
);

create table if not exists public.moc_records (
  id uuid default gen_random_uuid() not null,
  org_id uuid not null,
  moc_code text not null,
  title text not null,
  description text,
  justification text,
  category text not null,
  type text not null,
  stage text default 'Draft'::text,
  priority text default 'Medium'::text,
  risk_level text,
  originator_id uuid,
  owner_id uuid,
  department text,
  asset_id text,
  target_implementation_date date,
  expiry_date date,
  actual_implementation_date timestamp with time zone,
  closure_date timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by uuid
);

create table if not exists public.moc_reviews (
  id uuid default gen_random_uuid() not null,
  moc_id uuid not null,
  reviewer_id uuid not null,
  discipline text,
  status text default 'Pending'::text,
  comments text,
  due_date date,
  completed_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

create table if not exists public.peer_review_audit (
  id uuid default gen_random_uuid() not null,
  review_id uuid,
  actor_id uuid,
  action text not null,
  details jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.peer_review_comments (
  id uuid default gen_random_uuid() not null,
  review_id uuid,
  author_id uuid,
  comment_text text not null,
  severity text default 'Minor'::text,
  status text default 'Open'::text,
  discipline text,
  response_text text,
  responded_by uuid,
  responded_at timestamp with time zone,
  verified_by uuid,
  verified_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.peer_reviews (
  id uuid default gen_random_uuid() not null,
  org_id uuid,
  review_code text not null,
  title text not null,
  review_type text not null,
  project_asset text,
  department text,
  discipline text,
  coordinator_id uuid,
  lead_reviewer_id uuid,
  author_id uuid,
  stage text default 'Draft'::text,
  priority text default 'Medium'::text,
  due_date date,
  decision text,
  scope_description text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by uuid
);

-- ---------------------------------------------------------------
-- Primary keys, unique constraints, foreign keys and checks
-- ---------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'compliance_audits_pkey'
                    and conrelid = 'public.compliance_audits'::regclass) then
    execute $q$alter table public.compliance_audits add constraint compliance_audits_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'compliance_frameworks_pkey'
                    and conrelid = 'public.compliance_frameworks'::regclass) then
    execute $q$alter table public.compliance_frameworks add constraint compliance_frameworks_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'compliance_requirements_pkey'
                    and conrelid = 'public.compliance_requirements'::regclass) then
    execute $q$alter table public.compliance_requirements add constraint compliance_requirements_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'compliance_rules_pkey'
                    and conrelid = 'public.compliance_rules'::regclass) then
    execute $q$alter table public.compliance_rules add constraint compliance_rules_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'doc_activity_log_pkey'
                    and conrelid = 'public.doc_activity_log'::regclass) then
    execute $q$alter table public.doc_activity_log add constraint doc_activity_log_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'doc_categories_pkey'
                    and conrelid = 'public.doc_categories'::regclass) then
    execute $q$alter table public.doc_categories add constraint doc_categories_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'doc_comments_pkey'
                    and conrelid = 'public.doc_comments'::regclass) then
    execute $q$alter table public.doc_comments add constraint doc_comments_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'doc_distribution_pkey'
                    and conrelid = 'public.doc_distribution'::regclass) then
    execute $q$alter table public.doc_distribution add constraint doc_distribution_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'doc_revisions_pkey'
                    and conrelid = 'public.doc_revisions'::regclass) then
    execute $q$alter table public.doc_revisions add constraint doc_revisions_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'doc_workflows_pkey'
                    and conrelid = 'public.doc_workflows'::regclass) then
    execute $q$alter table public.doc_workflows add constraint doc_workflows_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'documents_pkey'
                    and conrelid = 'public.documents'::regclass) then
    execute $q$alter table public.documents add constraint documents_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_actions_pkey'
                    and conrelid = 'public.moc_actions'::regclass) then
    execute $q$alter table public.moc_actions add constraint moc_actions_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_activity_log_pkey'
                    and conrelid = 'public.moc_activity_log'::regclass) then
    execute $q$alter table public.moc_activity_log add constraint moc_activity_log_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_approvals_pkey'
                    and conrelid = 'public.moc_approvals'::regclass) then
    execute $q$alter table public.moc_approvals add constraint moc_approvals_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_comments_pkey'
                    and conrelid = 'public.moc_comments'::regclass) then
    execute $q$alter table public.moc_comments add constraint moc_comments_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_impacts_pkey'
                    and conrelid = 'public.moc_impacts'::regclass) then
    execute $q$alter table public.moc_impacts add constraint moc_impacts_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_records_pkey'
                    and conrelid = 'public.moc_records'::regclass) then
    execute $q$alter table public.moc_records add constraint moc_records_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_reviews_pkey'
                    and conrelid = 'public.moc_reviews'::regclass) then
    execute $q$alter table public.moc_reviews add constraint moc_reviews_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_review_audit_pkey'
                    and conrelid = 'public.peer_review_audit'::regclass) then
    execute $q$alter table public.peer_review_audit add constraint peer_review_audit_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_review_comments_pkey'
                    and conrelid = 'public.peer_review_comments'::regclass) then
    execute $q$alter table public.peer_review_comments add constraint peer_review_comments_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_reviews_pkey'
                    and conrelid = 'public.peer_reviews'::regclass) then
    execute $q$alter table public.peer_reviews add constraint peer_reviews_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_actions_pkey'
                    and conrelid = 'public.risk_actions'::regclass) then
    execute $q$alter table public.risk_actions add constraint risk_actions_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_activity_log_pkey'
                    and conrelid = 'public.risk_activity_log'::regclass) then
    execute $q$alter table public.risk_activity_log add constraint risk_activity_log_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_attachments_pkey'
                    and conrelid = 'public.risk_attachments'::regclass) then
    execute $q$alter table public.risk_attachments add constraint risk_attachments_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_comments_pkey'
                    and conrelid = 'public.risk_comments'::regclass) then
    execute $q$alter table public.risk_comments add constraint risk_comments_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_kris_pkey'
                    and conrelid = 'public.risk_kris'::regclass) then
    execute $q$alter table public.risk_kris add constraint risk_kris_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_links_pkey'
                    and conrelid = 'public.risk_links'::regclass) then
    execute $q$alter table public.risk_links add constraint risk_links_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_mitigation_actions_pkey'
                    and conrelid = 'public.risk_mitigation_actions'::regclass) then
    execute $q$alter table public.risk_mitigation_actions add constraint risk_mitigation_actions_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_register_pkey'
                    and conrelid = 'public.risk_register'::regclass) then
    execute $q$alter table public.risk_register add constraint risk_register_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_register_snapshots_pkey'
                    and conrelid = 'public.risk_register_snapshots'::regclass) then
    execute $q$alter table public.risk_register_snapshots add constraint risk_register_snapshots_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_reviews_pkey'
                    and conrelid = 'public.risk_reviews'::regclass) then
    execute $q$alter table public.risk_reviews add constraint risk_reviews_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_scenarios_pkey'
                    and conrelid = 'public.risk_scenarios'::regclass) then
    execute $q$alter table public.risk_scenarios add constraint risk_scenarios_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_tags_pkey'
                    and conrelid = 'public.risk_tags'::regclass) then
    execute $q$alter table public.risk_tags add constraint risk_tags_pkey PRIMARY KEY (id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'doc_revisions_document_id_revision_number_key'
                    and conrelid = 'public.doc_revisions'::regclass) then
    execute $q$alter table public.doc_revisions add constraint doc_revisions_document_id_revision_number_key UNIQUE (document_id, revision_number)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'documents_org_id_document_number_key'
                    and conrelid = 'public.documents'::regclass) then
    execute $q$alter table public.documents add constraint documents_org_id_document_number_key UNIQUE (org_id, document_number)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_records_org_id_moc_code_key'
                    and conrelid = 'public.moc_records'::regclass) then
    execute $q$alter table public.moc_records add constraint moc_records_org_id_moc_code_key UNIQUE (org_id, moc_code)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'compliance_audits_auditor_id_fkey'
                    and conrelid = 'public.compliance_audits'::regclass) then
    execute $q$alter table public.compliance_audits add constraint compliance_audits_auditor_id_fkey FOREIGN KEY (auditor_id) REFERENCES auth.users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'compliance_audits_framework_id_fkey'
                    and conrelid = 'public.compliance_audits'::regclass) then
    execute $q$alter table public.compliance_audits add constraint compliance_audits_framework_id_fkey FOREIGN KEY (framework_id) REFERENCES compliance_frameworks(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'compliance_audits_org_id_fkey'
                    and conrelid = 'public.compliance_audits'::regclass) then
    execute $q$alter table public.compliance_audits add constraint compliance_audits_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'compliance_frameworks_org_id_fkey'
                    and conrelid = 'public.compliance_frameworks'::regclass) then
    execute $q$alter table public.compliance_frameworks add constraint compliance_frameworks_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'compliance_requirements_framework_id_fkey'
                    and conrelid = 'public.compliance_requirements'::regclass) then
    execute $q$alter table public.compliance_requirements add constraint compliance_requirements_framework_id_fkey FOREIGN KEY (framework_id) REFERENCES compliance_frameworks(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'compliance_rules_org_id_fkey'
                    and conrelid = 'public.compliance_rules'::regclass) then
    execute $q$alter table public.compliance_rules add constraint compliance_rules_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'compliance_rules_responsible_person_id_fkey'
                    and conrelid = 'public.compliance_rules'::regclass) then
    execute $q$alter table public.compliance_rules add constraint compliance_rules_responsible_person_id_fkey FOREIGN KEY (responsible_person_id) REFERENCES auth.users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'compliance_rules_severity_check'
                    and conrelid = 'public.compliance_rules'::regclass) then
    execute $q$alter table public.compliance_rules add constraint compliance_rules_severity_check CHECK ((severity = ANY (ARRAY['Critical'::text, 'High'::text, 'Medium'::text, 'Low'::text])))$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'doc_activity_log_document_id_fkey'
                    and conrelid = 'public.doc_activity_log'::regclass) then
    execute $q$alter table public.doc_activity_log add constraint doc_activity_log_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'doc_comments_document_id_fkey'
                    and conrelid = 'public.doc_comments'::regclass) then
    execute $q$alter table public.doc_comments add constraint doc_comments_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'doc_comments_revision_id_fkey'
                    and conrelid = 'public.doc_comments'::regclass) then
    execute $q$alter table public.doc_comments add constraint doc_comments_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES doc_revisions(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'doc_distribution_document_id_fkey'
                    and conrelid = 'public.doc_distribution'::regclass) then
    execute $q$alter table public.doc_distribution add constraint doc_distribution_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'doc_revisions_document_id_fkey'
                    and conrelid = 'public.doc_revisions'::regclass) then
    execute $q$alter table public.doc_revisions add constraint doc_revisions_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'doc_workflows_revision_id_fkey'
                    and conrelid = 'public.doc_workflows'::regclass) then
    execute $q$alter table public.doc_workflows add constraint doc_workflows_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES doc_revisions(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'documents_category_id_fkey'
                    and conrelid = 'public.documents'::regclass) then
    execute $q$alter table public.documents add constraint documents_category_id_fkey FOREIGN KEY (category_id) REFERENCES doc_categories(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_actions_assigned_to_fkey'
                    and conrelid = 'public.moc_actions'::regclass) then
    execute $q$alter table public.moc_actions add constraint moc_actions_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_actions_moc_id_fkey'
                    and conrelid = 'public.moc_actions'::regclass) then
    execute $q$alter table public.moc_actions add constraint moc_actions_moc_id_fkey FOREIGN KEY (moc_id) REFERENCES moc_records(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_activity_log_actor_id_fkey'
                    and conrelid = 'public.moc_activity_log'::regclass) then
    execute $q$alter table public.moc_activity_log add constraint moc_activity_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_activity_log_moc_id_fkey'
                    and conrelid = 'public.moc_activity_log'::regclass) then
    execute $q$alter table public.moc_activity_log add constraint moc_activity_log_moc_id_fkey FOREIGN KEY (moc_id) REFERENCES moc_records(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_approvals_approver_id_fkey'
                    and conrelid = 'public.moc_approvals'::regclass) then
    execute $q$alter table public.moc_approvals add constraint moc_approvals_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_approvals_moc_id_fkey'
                    and conrelid = 'public.moc_approvals'::regclass) then
    execute $q$alter table public.moc_approvals add constraint moc_approvals_moc_id_fkey FOREIGN KEY (moc_id) REFERENCES moc_records(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_comments_moc_id_fkey'
                    and conrelid = 'public.moc_comments'::regclass) then
    execute $q$alter table public.moc_comments add constraint moc_comments_moc_id_fkey FOREIGN KEY (moc_id) REFERENCES moc_records(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_comments_user_id_fkey'
                    and conrelid = 'public.moc_comments'::regclass) then
    execute $q$alter table public.moc_comments add constraint moc_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_impacts_moc_id_fkey'
                    and conrelid = 'public.moc_impacts'::regclass) then
    execute $q$alter table public.moc_impacts add constraint moc_impacts_moc_id_fkey FOREIGN KEY (moc_id) REFERENCES moc_records(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_records_created_by_fkey'
                    and conrelid = 'public.moc_records'::regclass) then
    execute $q$alter table public.moc_records add constraint moc_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_records_org_id_fkey'
                    and conrelid = 'public.moc_records'::regclass) then
    execute $q$alter table public.moc_records add constraint moc_records_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_records_originator_id_fkey'
                    and conrelid = 'public.moc_records'::regclass) then
    execute $q$alter table public.moc_records add constraint moc_records_originator_id_fkey FOREIGN KEY (originator_id) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_records_owner_id_fkey'
                    and conrelid = 'public.moc_records'::regclass) then
    execute $q$alter table public.moc_records add constraint moc_records_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_reviews_moc_id_fkey'
                    and conrelid = 'public.moc_reviews'::regclass) then
    execute $q$alter table public.moc_reviews add constraint moc_reviews_moc_id_fkey FOREIGN KEY (moc_id) REFERENCES moc_records(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'moc_reviews_reviewer_id_fkey'
                    and conrelid = 'public.moc_reviews'::regclass) then
    execute $q$alter table public.moc_reviews add constraint moc_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_review_audit_actor_id_fkey'
                    and conrelid = 'public.peer_review_audit'::regclass) then
    execute $q$alter table public.peer_review_audit add constraint peer_review_audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_review_audit_review_id_fkey'
                    and conrelid = 'public.peer_review_audit'::regclass) then
    execute $q$alter table public.peer_review_audit add constraint peer_review_audit_review_id_fkey FOREIGN KEY (review_id) REFERENCES peer_reviews(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_review_comments_author_id_fkey'
                    and conrelid = 'public.peer_review_comments'::regclass) then
    execute $q$alter table public.peer_review_comments add constraint peer_review_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_review_comments_responded_by_fkey'
                    and conrelid = 'public.peer_review_comments'::regclass) then
    execute $q$alter table public.peer_review_comments add constraint peer_review_comments_responded_by_fkey FOREIGN KEY (responded_by) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_review_comments_review_id_fkey'
                    and conrelid = 'public.peer_review_comments'::regclass) then
    execute $q$alter table public.peer_review_comments add constraint peer_review_comments_review_id_fkey FOREIGN KEY (review_id) REFERENCES peer_reviews(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_review_comments_verified_by_fkey'
                    and conrelid = 'public.peer_review_comments'::regclass) then
    execute $q$alter table public.peer_review_comments add constraint peer_review_comments_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_reviews_author_id_fkey'
                    and conrelid = 'public.peer_reviews'::regclass) then
    execute $q$alter table public.peer_reviews add constraint peer_reviews_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_reviews_coordinator_id_fkey'
                    and conrelid = 'public.peer_reviews'::regclass) then
    execute $q$alter table public.peer_reviews add constraint peer_reviews_coordinator_id_fkey FOREIGN KEY (coordinator_id) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_reviews_created_by_fkey'
                    and conrelid = 'public.peer_reviews'::regclass) then
    execute $q$alter table public.peer_reviews add constraint peer_reviews_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_reviews_lead_reviewer_id_fkey'
                    and conrelid = 'public.peer_reviews'::regclass) then
    execute $q$alter table public.peer_reviews add constraint peer_reviews_lead_reviewer_id_fkey FOREIGN KEY (lead_reviewer_id) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'peer_reviews_org_id_fkey'
                    and conrelid = 'public.peer_reviews'::regclass) then
    execute $q$alter table public.peer_reviews add constraint peer_reviews_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_actions_action_owner_id_fkey'
                    and conrelid = 'public.risk_actions'::regclass) then
    execute $q$alter table public.risk_actions add constraint risk_actions_action_owner_id_fkey FOREIGN KEY (action_owner_id) REFERENCES auth.users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_actions_risk_id_fkey'
                    and conrelid = 'public.risk_actions'::regclass) then
    execute $q$alter table public.risk_actions add constraint risk_actions_risk_id_fkey FOREIGN KEY (risk_id) REFERENCES risk_register(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_activity_log_risk_id_fkey'
                    and conrelid = 'public.risk_activity_log'::regclass) then
    execute $q$alter table public.risk_activity_log add constraint risk_activity_log_risk_id_fkey FOREIGN KEY (risk_id) REFERENCES risk_register(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_activity_log_user_id_fkey'
                    and conrelid = 'public.risk_activity_log'::regclass) then
    execute $q$alter table public.risk_activity_log add constraint risk_activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_attachments_risk_id_fkey'
                    and conrelid = 'public.risk_attachments'::regclass) then
    execute $q$alter table public.risk_attachments add constraint risk_attachments_risk_id_fkey FOREIGN KEY (risk_id) REFERENCES risk_register(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_attachments_uploaded_by_fkey'
                    and conrelid = 'public.risk_attachments'::regclass) then
    execute $q$alter table public.risk_attachments add constraint risk_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_comments_risk_id_fkey'
                    and conrelid = 'public.risk_comments'::regclass) then
    execute $q$alter table public.risk_comments add constraint risk_comments_risk_id_fkey FOREIGN KEY (risk_id) REFERENCES risk_register(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_comments_user_id_fkey'
                    and conrelid = 'public.risk_comments'::regclass) then
    execute $q$alter table public.risk_comments add constraint risk_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_kris_risk_id_fkey'
                    and conrelid = 'public.risk_kris'::regclass) then
    execute $q$alter table public.risk_kris add constraint risk_kris_risk_id_fkey FOREIGN KEY (risk_id) REFERENCES risk_register(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_links_source_risk_id_fkey'
                    and conrelid = 'public.risk_links'::regclass) then
    execute $q$alter table public.risk_links add constraint risk_links_source_risk_id_fkey FOREIGN KEY (source_risk_id) REFERENCES risk_register(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_links_target_risk_id_fkey'
                    and conrelid = 'public.risk_links'::regclass) then
    execute $q$alter table public.risk_links add constraint risk_links_target_risk_id_fkey FOREIGN KEY (target_risk_id) REFERENCES risk_register(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_mitigation_actions_owner_id_fkey'
                    and conrelid = 'public.risk_mitigation_actions'::regclass) then
    execute $q$alter table public.risk_mitigation_actions add constraint risk_mitigation_actions_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_mitigation_actions_risk_id_fkey'
                    and conrelid = 'public.risk_mitigation_actions'::regclass) then
    execute $q$alter table public.risk_mitigation_actions add constraint risk_mitigation_actions_risk_id_fkey FOREIGN KEY (risk_id) REFERENCES risk_register(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_register_created_by_fkey'
                    and conrelid = 'public.risk_register'::regclass) then
    execute $q$alter table public.risk_register add constraint risk_register_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_register_impact_check'
                    and conrelid = 'public.risk_register'::regclass) then
    execute $q$alter table public.risk_register add constraint risk_register_impact_check CHECK (((impact >= 1) AND (impact <= 5)))$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_register_likelihood_check'
                    and conrelid = 'public.risk_register'::regclass) then
    execute $q$alter table public.risk_register add constraint risk_register_likelihood_check CHECK (((likelihood >= 1) AND (likelihood <= 5)))$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_register_org_id_fkey'
                    and conrelid = 'public.risk_register'::regclass) then
    execute $q$alter table public.risk_register add constraint risk_register_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_register_owner_id_fkey'
                    and conrelid = 'public.risk_register'::regclass) then
    execute $q$alter table public.risk_register add constraint risk_register_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_register_snapshots_created_by_fkey'
                    and conrelid = 'public.risk_register_snapshots'::regclass) then
    execute $q$alter table public.risk_register_snapshots add constraint risk_register_snapshots_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_register_snapshots_org_id_fkey'
                    and conrelid = 'public.risk_register_snapshots'::regclass) then
    execute $q$alter table public.risk_register_snapshots add constraint risk_register_snapshots_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_reviews_reviewer_id_fkey'
                    and conrelid = 'public.risk_reviews'::regclass) then
    execute $q$alter table public.risk_reviews add constraint risk_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_reviews_risk_id_fkey'
                    and conrelid = 'public.risk_reviews'::regclass) then
    execute $q$alter table public.risk_reviews add constraint risk_reviews_risk_id_fkey FOREIGN KEY (risk_id) REFERENCES risk_register(id) ON DELETE CASCADE$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_scenarios_org_id_fkey'
                    and conrelid = 'public.risk_scenarios'::regclass) then
    execute $q$alter table public.risk_scenarios add constraint risk_scenarios_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id)$q$;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'risk_tags_risk_id_fkey'
                    and conrelid = 'public.risk_tags'::regclass) then
    execute $q$alter table public.risk_tags add constraint risk_tags_risk_id_fkey FOREIGN KEY (risk_id) REFERENCES risk_register(id) ON DELETE CASCADE$q$;
  end if;
end $$;

-- ---------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------

create index if not exists idx_doc_revisions_doc_id ON public.doc_revisions USING btree (document_id);
create index if not exists idx_doc_workflows_reviewer ON public.doc_workflows USING btree (reviewer_id);
create index if not exists idx_documents_dept ON public.documents USING btree (department);
create index if not exists idx_documents_org_id ON public.documents USING btree (org_id);
create index if not exists idx_documents_status ON public.documents USING btree (status);

commit;
