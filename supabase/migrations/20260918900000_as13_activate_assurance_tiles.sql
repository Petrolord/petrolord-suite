-- AS13 — the Assurance module goes Active (HELD).
--
-- Seven tiles leave Coming Soon together, each because its wave made the
-- app real (Assurance-ROADMAP.md §4, AssuranceApps-STATUS.md §3c-§3i):
--
--   document-control         AS4  a create path that reported success on
--                                  failure, and invented documents for an
--                                  empty library, both gone
--   peer-review-manager      AS5  persisted nothing at all; now does
--   management-of-change     AS6  a create form with no state; now gated
--   quality-assurance-plan   AS7  no database at all; now plans, NCRs, CAPAs
--   iso-compliance-tool      AS8  a compliance percentage from Math.random()
--   lesson-learned-db        AS9  lessons with nowhere to record their use
--   audit-findings-manager   AS10 new: the app behind two tiles sold empty
--
-- Post-state: Assurance = 10 Active (these seven plus risk-register,
-- risk-heatmap and regulatory-compliance), 0 Coming Soon, 24 Archived.
--
-- DEPLOY GATE. Apply ONLY after:
--   1. every AS3-AS10 migration and the AS10 tile seed are applied
--      (tools/validation/assurance/assurance-launch-apply.sh, in order),
--      because a tile must never be sold over a table that does not exist;
--   2. the production upload that ships the AS4-AS13 routes is live and
--      each route has been served on the deployed site. A tile must never
--      go Active before its route is on the deploy target (the F12 rule).
--
-- A tile whose row is missing is reported and skipped, never inserted:
-- the AS10 seed owns that row. Descriptions follow the owner's copy rule.
-- Rows are preserved; status flips only. Idempotent.

do $$
declare
  r record;
  v_missing text[] := '{}';
begin
  for r in
    select * from (values
      ('document-control',
       'Controlled documents with a real revision chain, an approval queue, '
       || 'review dates that fall due from the date of issue, and '
       || 'confidentiality. An empty library is shown as empty.'),
      ('peer-review-manager',
       'Technical peer reviews with comment severity and disposition. A '
       || 'review cannot be closed while a Critical or Major comment is '
       || 'unresolved, and every action is kept in the audit trail.'),
      ('management-of-change',
       'Management of change with impact assessment, a multi-level approval '
       || 'gate every level must sign, actions closed before the change goes '
       || 'in, and temporary changes that expire.'),
      ('quality-assurance-plan',
       'Quality plans and inspection and test points with hold points that '
       || 'stop work, non-conformance reports closed on evidence, and '
       || 'corrective actions checked for effectiveness.'),
      ('iso-compliance-tool',
       'ISO 9001, 14001 and 45001 clause registers, an internal audit '
       || 'programme with auditor independence, findings to closure, and '
       || 'certification readiness as a list of named blockers.'),
      ('lesson-learned-db',
       'A lessons database where a lesson is validated by someone other than '
       || 'its author and counts as embedded only once it has changed a risk, '
       || 'a change or a procedure.'),
      ('audit-findings-manager',
       'Audit programmes and checklist audits: every item answered, a '
       || 'critical nonconformance raises a finding, stop-work findings '
       || 'record their immediate correction, and findings run to closure.')
    ) as t(slug, description)
  loop
    if not exists (select 1 from public.master_apps
                    where slug = r.slug and lower(module) = 'assurance') then
      v_missing := v_missing || r.slug;
      continue;
    end if;
    update public.master_apps
       set status = 'Active',
           is_built = true,
           is_functional = true,
           description = r.description,
           updated_at = now()
     where slug = r.slug
       and lower(module) = 'assurance';
  end loop;

  if array_length(v_missing, 1) > 0 then
    raise notice 'Assurance tiles not present, skipped: %. Run the AS10 seed first.', v_missing;
  end if;
end $$;
