-- AS1 — row level security for the Assurance schema
-- (Assurance-ROADMAP.md §1.4.)
--
-- Read live from pg_class.relrowsecurity and
-- information_schema.role_table_grants on 2026-09-16:
--
--   TWENTY-THREE Assurance tables have RLS DISABLED and carry
--   SELECT, INSERT, UPDATE, DELETE, TRUNCATE grants to BOTH 'anon'
--   AND 'authenticated'.
--
-- The four parent registers (risk_register, documents, moc_records,
-- peer_reviews) do have RLS. Their children do not. The child rows are
-- where the content actually lives: every risk comment, every MOC
-- approval decision, every document revision and its file_url, every
-- audit trail entry. Protection on the parent alone is decorative.
--
-- 'anon' is the role behind the publishable key that ships inside the
-- production SPA bundle, so this is a cross-tenant read AND write path
-- for anyone who opens the bundle.
--
-- These tables are empty today, which is the only reason this is a
-- defect and not an incident. They stop being empty the moment the
-- module is used, which is what the AS programme is for. Hence: before
-- any other AS work lands.
--
-- Shape of the fix:
--   * REVOKE ALL from 'anon' on every one of the twenty-three.
--   * ENABLE ROW LEVEL SECURITY on every one.
--   * Parents carry org_id. Children carry only a parent key, so each
--     child policy is an EXISTS against its parent's org_id.
--   * Scoping goes through public.my_org_id() (SECURITY DEFINER, from
--     20260713300000_membership_consolidation.sql), the same helper
--     every other module's policies use. is_super_admin() is honoured
--     everywhere so the console keeps working.
--   * Writes stay with 'authenticated' inside the org. The service role
--     bypasses RLS and is unaffected.
--
-- Idempotent: policies are dropped and recreated.

begin;

-- ---------------------------------------------------------------
-- 1. Revoke the anon grants. No Assurance table is public.
-- ---------------------------------------------------------------
revoke all on table
  public.risk_actions,
  public.risk_comments,
  public.risk_attachments,
  public.risk_reviews,
  public.risk_tags,
  public.risk_links,
  public.risk_activity_log,
  public.risk_register_snapshots,
  public.documents,
  public.doc_revisions,
  public.doc_comments,
  public.doc_categories,
  public.doc_distribution,
  public.doc_workflows,
  public.doc_activity_log,
  public.moc_actions,
  public.moc_approvals,
  public.moc_comments,
  public.moc_impacts,
  public.moc_reviews,
  public.moc_activity_log,
  public.compliance_audits,
  public.compliance_frameworks,
  public.compliance_requirements,
  -- the four parent registers and the peer-review children: their RLS
  -- is already on, but every one of them ALSO grants anon full CRUD.
  -- Their policies are written FOR ROLE public rather than
  -- authenticated, so anon is held out only by auth.uid() being null
  -- inside my_org_id(). That is one refactor away from being a hole.
  -- Take the grant away and the question stops being load-bearing.
  public.risk_register,
  public.moc_records,
  public.peer_reviews,
  public.peer_review_comments,
  public.peer_review_audit,
  public.compliance_rules,
  public.risk_kris,
  public.risk_mitigation_actions,
  public.risk_scenarios
from anon;

-- ---------------------------------------------------------------
-- 2. Enable RLS
-- ---------------------------------------------------------------
alter table public.risk_actions            enable row level security;
alter table public.risk_comments           enable row level security;
alter table public.risk_attachments        enable row level security;
alter table public.risk_reviews            enable row level security;
alter table public.risk_tags               enable row level security;
alter table public.risk_links              enable row level security;
alter table public.risk_activity_log       enable row level security;
alter table public.risk_register_snapshots enable row level security;
alter table public.doc_revisions           enable row level security;
alter table public.doc_comments            enable row level security;
alter table public.doc_categories          enable row level security;
alter table public.doc_distribution        enable row level security;
alter table public.doc_workflows           enable row level security;
alter table public.doc_activity_log        enable row level security;
alter table public.moc_actions             enable row level security;
alter table public.moc_approvals           enable row level security;
alter table public.moc_comments            enable row level security;
alter table public.moc_impacts             enable row level security;
alter table public.moc_reviews             enable row level security;
alter table public.moc_activity_log        enable row level security;
alter table public.compliance_audits       enable row level security;
alter table public.compliance_frameworks   enable row level security;
alter table public.compliance_requirements enable row level security;

-- ---------------------------------------------------------------
-- 3. Tables that carry org_id themselves
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'risk_register_snapshots',
    'doc_categories',
    'compliance_audits',
    'compliance_frameworks'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_org_rw', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (org_id = public.my_org_id() or public.is_super_admin())
        with check (org_id = public.my_org_id() or public.is_super_admin())
    $f$, t || '_org_rw', t);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- 4. Children of risk_register (risk_id -> risk_register.id)
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'risk_actions',
    'risk_comments',
    'risk_attachments',
    'risk_reviews',
    'risk_tags',
    'risk_activity_log'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_org_rw', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (
          public.is_super_admin() or exists (
            select 1 from public.risk_register r
             where r.id = %I.risk_id and r.org_id = public.my_org_id()
          )
        )
        with check (
          public.is_super_admin() or exists (
            select 1 from public.risk_register r
             where r.id = %I.risk_id and r.org_id = public.my_org_id()
          )
        )
    $f$, t || '_org_rw', t, t, t);
  end loop;
end $$;

-- risk_links joins two risks; BOTH ends must be inside the org, or the
-- table becomes a way to discover that a risk id exists elsewhere.
drop policy if exists risk_links_org_rw on public.risk_links;
create policy risk_links_org_rw on public.risk_links
  for all to authenticated
  using (
    public.is_super_admin() or (
      exists (select 1 from public.risk_register r
               where r.id = risk_links.source_risk_id
                 and r.org_id = public.my_org_id())
      and
      exists (select 1 from public.risk_register r
               where r.id = risk_links.target_risk_id
                 and r.org_id = public.my_org_id())
    )
  )
  with check (
    public.is_super_admin() or (
      exists (select 1 from public.risk_register r
               where r.id = risk_links.source_risk_id
                 and r.org_id = public.my_org_id())
      and
      exists (select 1 from public.risk_register r
               where r.id = risk_links.target_risk_id
                 and r.org_id = public.my_org_id())
    )
  );

-- ---------------------------------------------------------------
-- 5. Children of documents (document_id -> documents.id)
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'doc_revisions',
    'doc_comments',
    'doc_distribution',
    'doc_activity_log'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_org_rw', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (
          public.is_super_admin() or exists (
            select 1 from public.documents d
             where d.id = %I.document_id and d.org_id = public.my_org_id()
          )
        )
        with check (
          public.is_super_admin() or exists (
            select 1 from public.documents d
             where d.id = %I.document_id and d.org_id = public.my_org_id()
          )
        )
    $f$, t || '_org_rw', t, t, t);
  end loop;
end $$;

-- doc_workflows hangs off a revision, one level further down.
drop policy if exists doc_workflows_org_rw on public.doc_workflows;
create policy doc_workflows_org_rw on public.doc_workflows
  for all to authenticated
  using (
    public.is_super_admin() or exists (
      select 1
        from public.doc_revisions rev
        join public.documents d on d.id = rev.document_id
       where rev.id = doc_workflows.revision_id
         and d.org_id = public.my_org_id()
    )
  )
  with check (
    public.is_super_admin() or exists (
      select 1
        from public.doc_revisions rev
        join public.documents d on d.id = rev.document_id
       where rev.id = doc_workflows.revision_id
         and d.org_id = public.my_org_id()
    )
  );

-- ---------------------------------------------------------------
-- 6. Children of moc_records (moc_id -> moc_records.id)
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'moc_actions',
    'moc_approvals',
    'moc_comments',
    'moc_impacts',
    'moc_reviews',
    'moc_activity_log'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_org_rw', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (
          public.is_super_admin() or exists (
            select 1 from public.moc_records m
             where m.id = %I.moc_id and m.org_id = public.my_org_id()
          )
        )
        with check (
          public.is_super_admin() or exists (
            select 1 from public.moc_records m
             where m.id = %I.moc_id and m.org_id = public.my_org_id()
          )
        )
    $f$, t || '_org_rw', t, t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- 7. compliance_requirements hangs off a framework
-- ---------------------------------------------------------------
drop policy if exists compliance_requirements_org_rw on public.compliance_requirements;
create policy compliance_requirements_org_rw on public.compliance_requirements
  for all to authenticated
  using (
    public.is_super_admin() or exists (
      select 1 from public.compliance_frameworks f
       where f.id = compliance_requirements.framework_id
         and f.org_id = public.my_org_id()
    )
  )
  with check (
    public.is_super_admin() or exists (
      select 1 from public.compliance_frameworks f
       where f.id = compliance_requirements.framework_id
         and f.org_id = public.my_org_id()
    )
  );

-- ---------------------------------------------------------------
-- 8. documents itself already has RLS and policies; it only needs the
--    anon grant taken away (done in step 1). Same for risk_register,
--    moc_records, peer_reviews, peer_review_comments, peer_review_audit.
-- ---------------------------------------------------------------

comment on table public.doc_revisions is
  'Document Control revision chain. RLS scoped through documents.org_id (AS1, 2026-09-16).';
comment on table public.moc_approvals is
  'MOC approval decisions. RLS scoped through moc_records.org_id (AS1, 2026-09-16).';
comment on table public.risk_comments is
  'Risk register comments. RLS scoped through risk_register.org_id (AS1, 2026-09-16).';

commit;
