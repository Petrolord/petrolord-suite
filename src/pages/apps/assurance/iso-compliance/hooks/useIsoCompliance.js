import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  auditIndependence,
  canAdvanceAudit,
  canCloseFinding,
  canSetClauseStatus,
  toDateOnlyString,
} from '@/lib/isoCompliance';
import {
  buildActionWrite,
  buildAuditWrite,
  buildClauseWrite,
  buildCoverageWrite,
  buildFindingWrite,
  buildStandardWrite,
  ASSESSED_STATUSES,
  canDeleteFinding,
  findingWithAuditStandard,
  independenceView,
  nextAuditCodeFromExisting,
  nextFindingCodeFromExisting,
  progressedFindingStatus,
  scopeLockReason,
  withAssessor,
} from '../utils/isoPayload';

const UNKNOWN_RELATION = 'PGRST200';
const UNDEFINED_TABLE = '42P01';
const UNDEFINED_FUNCTION = '42883';
const UNIQUE_VIOLATION = '23505';
/** Postgres: check constraint violated — which the independence trigger raises. */
const CHECK_VIOLATION = '23514';
/** Postgres: insufficient privilege — what the cross-tenant triggers raise. */
const INSUFFICIENT_PRIVILEGE = '42501';

const CODE_RETRIES = 3;

/**
 * AS8 — the one place this app reads and writes.
 *
 * There was nothing to replace: ISO Compliance issued no queries at
 * all. Its shell held `useState(isoClausesData)` and passed the four
 * generated arrays down as props, so every page in the app was a view
 * over data that `src/data/isoComplianceData.js` had invented at
 * module load — with `Math.random()` in the audit scores and the
 * dates, so it invented them again on every reload.
 *
 * `hasAs8Schema` is false while migration 20260917600000 is unapplied.
 * The app then says so, plainly, instead of showing thirty clauses
 * that do not exist.
 */
export const useIsoCompliance = () => {
  const { organization, user } = useAuth();
  const orgId = organization?.id || null;

  const [standards, setStandards] = useState([]);
  const [clauses, setClauses] = useState([]);
  const [audits, setAudits] = useState([]);
  const [auditClauses, setAuditClauses] = useState([]);
  const [findings, setFindings] = useState([]);
  const [actions, setActions] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasAs8Schema, setHasAs8Schema] = useState(true);

  const clearAll = () => {
    setStandards([]); setClauses([]); setAudits([]); setAuditClauses([]);
    setFindings([]); setActions([]); setActivity([]);
  };

  const fetchAll = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const standardRes = await supabase
        .from('iso_standards')
        .select('*')
        .eq('org_id', orgId)
        .order('code', { ascending: true });

      if (standardRes.error) {
        if (standardRes.error.code === UNDEFINED_TABLE
            || standardRes.error.code === UNKNOWN_RELATION) {
          setHasAs8Schema(false);
          clearAll();
          setLoading(false);
          return;
        }
        throw standardRes.error;
      }
      setHasAs8Schema(true);

      const [clauseRes, auditRes, findingRes, logRes] = await Promise.all([
        supabase.from('iso_clauses').select('*').eq('org_id', orgId)
          .order('clause_ref', { ascending: true }),
        supabase.from('iso_audits').select('*').eq('org_id', orgId)
          .order('planned_start', { ascending: false, nullsFirst: false }),
        supabase.from('iso_findings').select('*').eq('org_id', orgId)
          .order('raised_date', { ascending: false }),
        supabase.from('iso_activity_log').select('*').eq('org_id', orgId)
          .order('created_at', { ascending: false }).limit(300),
      ]);
      if (clauseRes.error) throw clauseRes.error;
      if (auditRes.error) throw auditRes.error;
      if (findingRes.error) throw findingRes.error;
      if (logRes.error) throw logRes.error;

      const auditRows = auditRes.data || [];
      const findingRows = findingRes.data || [];

      let coverageRows = [];
      if (auditRows.length) {
        const res = await supabase.from('iso_audit_clauses').select('*')
          .in('audit_id', auditRows.map((a) => a.id));
        if (res.error) throw res.error;
        coverageRows = res.data || [];
      }

      let actionRows = [];
      if (findingRows.length) {
        const res = await supabase.from('iso_actions').select('*')
          .in('finding_id', findingRows.map((f) => f.id))
          .order('due_date', { ascending: true, nullsFirst: false });
        if (res.error) throw res.error;
        actionRows = res.data || [];
      }

      setStandards(standardRes.data || []);
      setClauses(clauseRes.data || []);
      setAudits(auditRows);
      setAuditClauses(coverageRows);
      setFindings(findingRows);
      setActions(actionRows);
      setActivity(logRes.data || []);
    } catch (err) {
      // An organization with no clause register has no clause register.
      setError(err.message || 'Could not load the ISO register.');
      clearAll();
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const clausesFor = useCallback(
    (standardId) => clauses.filter((c) => c.standard_id === standardId), [clauses]);
  const coverageFor = useCallback(
    (auditId) => auditClauses.filter((c) => c.audit_id === auditId), [auditClauses]);
  const findingsForAudit = useCallback(
    (auditId) => findings.filter((f) => f.audit_id === auditId), [findings]);
  const findingsForClause = useCallback(
    (clauseId) => findings.filter((f) => f.clause_id === clauseId), [findings]);
  const actionsFor = useCallback(
    (findingId) => actions.filter((a) => a.finding_id === findingId), [actions]);
  const activityFor = useCallback(
    (entityId) => activity.filter(
      (a) => a.entity_id === entityId || a.audit_id === entityId
        || a.finding_id === entityId || a.standard_id === entityId),
    [activity]);

  const clauseById = useMemo(
    () => new Map(clauses.map((c) => [c.id, c])), [clauses]);

  /** Coverage rows carry no clause_ref of their own; the gates name them. */
  const coverageWithClauses = useCallback((auditId) => coverageFor(auditId).map((row) => {
    const clause = clauseById.get(row.clause_id) || null;
    return { ...row, clause, clause_ref: clause?.clause_ref || null };
  }), [coverageFor, clauseById]);

  const findingsWithActions = useMemo(
    () => findings.map((f) => ({ ...f, actions: actionsFor(f.id) })),
    [findings, actionsFor]);

  const logActivity = async (entityType, entityId, action, details, keys = {}) => {
    // Best effort: a logging failure must never make a real write
    // report as failed.
    if (!orgId) return;
    await supabase.from('iso_activity_log').insert([{
      org_id: orgId,
      entity_type: entityType,
      entity_id: entityId,
      standard_id: keys.standard_id || null,
      audit_id: keys.audit_id || null,
      finding_id: keys.finding_id || null,
      actor_id: user?.id || null,
      action,
      details: details || null,
    }]);
  };

  /**
   * A check-constraint failure means the database refused something
   * the form should have caught first. Naming it beats showing a user
   * a constraint name.
   */
  const explainWriteError = (err) => {
    if (err.code === INSUFFICIENT_PRIVILEGE) {
      return err.message || 'That record belongs to another organization.';
    }
    if (err.code === CHECK_VIOLATION && /own work|19011/.test(err.message)) {
      return err.message;
    }
    if (err.code !== CHECK_VIOLATION) return err.message;
    if (/claim_needs_evidence/.test(err.message)) {
      return 'A clause marked conformant needs the evidence reference, the date it was '
        + 'assessed and who assessed it. Conformity is a claim about documented information.';
    }
    if (/nonconformity_needs_assessor/.test(err.message)) {
      return 'Record the date this was assessed and who assessed it.';
    }
    if (/exclusion_needs_justification/.test(err.message)) {
      return 'ISO 9001:2015 §4.3 requires the justification for a requirement determined '
        + 'not applicable to be kept. Say why this one does not apply.';
    }
    if (/applicability_agrees_with_status/.test(err.message)) {
      return 'A clause determined not applicable cannot also carry a conformity verdict.';
    }
    if (/certified_needs_certificate/.test(err.message)) {
      return 'A certified standard needs its certificate number, the certification body '
        + 'and the expiry date.';
    }
    if (/report_needs_record/.test(err.message)) {
      return 'A reported audit needs the report date, a named lead auditor and the '
        + 'conclusion. A score out of 100 is not a report.';
    }
    if (/result_needs_date/.test(err.message)) {
      return 'Record the date this clause was examined.';
    }
    if (/findings_closure_needs_record/.test(err.message)) {
      return 'Closing a nonconformity needs the correction recorded, and a major one needs '
        + 'the root cause as well.';
    }
    if (/void_needs_reason/.test(err.message)) {
      return 'Say why this finding was raised in error.';
    }
    if (/effectiveness_needs_record/.test(err.message)) {
      return 'An effectiveness check needs the date it was made and who made it, whether '
        + 'the verdict is effective or not effective.';
    }
    if (/complete_needs_date/.test(err.message)) {
      return 'Record when the action was completed.';
    }
    if (/_dates_check/.test(err.message)) {
      return 'Those dates are in the wrong order.';
    }
    if (/_check$|_check"/.test(err.message)) {
      return 'One of the values on this record is not one the register accepts.';
    }
    return err.message;
  };

  const issueCode = async (kind, attempt) => {
    const year = new Date().getFullYear();
    const fn = kind === 'audit' ? 'next_iso_audit_code' : 'next_iso_finding_code';
    const { data, error: err } = await supabase.rpc(fn, { p_org: orgId, p_year: year });
    if (!err && data) return data;
    if (err && err.code !== UNDEFINED_FUNCTION) throw err;
    const fallback = kind === 'audit'
      ? nextAuditCodeFromExisting(audits, year)
      : nextFindingCodeFromExisting(findings, year);
    if (attempt === 0) return fallback;
    const m = /^([A-Z]+)-(\d+)-(\d+)$/.exec(fallback);
    return `${m[1]}-${m[2]}-${String(Number(m[3]) + attempt).padStart(3, '0')}`;
  };

  /* ---------------------------------------------------------------- */
  /* Standards                                                        */
  /* ---------------------------------------------------------------- */

  const createStandard = async (form) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };
    const { row } = buildStandardWrite(form);
    const { data, error: err } = await supabase
      .from('iso_standards')
      .insert([{ ...row, org_id: orgId, created_by: user?.id || null }])
      .select().single();
    if (err) return { success: false, error: explainWriteError(err) };
    await logActivity('standard', data.id, `${data.code} added to the register`, null,
      { standard_id: data.id });
    await fetchAll();
    return { success: true, data };
  };

  const updateStandard = async (id, form) => {
    const { row } = buildStandardWrite(form);
    const { data, error: err } = await supabase.from('iso_standards')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true, data };
  };

  const deleteStandard = async (id) => {
    const { error: err } = await supabase.from('iso_standards').delete().eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true };
  };

  /* ---------------------------------------------------------------- */
  /* Clauses                                                          */
  /* ---------------------------------------------------------------- */

  const createClause = async (form) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };
    const verdict = canSetClauseStatus({}, form.status || 'Not assessed', form);
    if (!verdict.ok) return { success: false, error: verdict.reason };
    const { row } = buildClauseWrite(form);
    const { data, error: err } = await supabase
      .from('iso_clauses')
      .insert([{ ...row, org_id: orgId, status: row.status || 'Not assessed' }])
      .select().single();
    if (err) {
      if (err.code === UNIQUE_VIOLATION) {
        return {
          success: false,
          error: `Clause ${form.clause_ref} is already in this standard's register.`,
        };
      }
      return { success: false, error: explainWriteError(err) };
    }
    await logActivity('clause', data.id, `Clause ${data.clause_ref} added`, null,
      { standard_id: data.standard_id });
    await fetchAll();
    return { success: true, data };
  };

  /**
   * Not exported: `assessClause` is its only caller, and a clause's
   * conformity must not be settable around the gate.
   */
  const updateClause = async (id, form) => {
    const { row } = buildClauseWrite(form);
    const { data, error: err } = await supabase.from('iso_clauses')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true, data };
  };

  /**
   * Assess a clause, through the gate.
   *
   * The old app's Add Clause modal set every new clause to Compliant
   * with no evidence, no date and no assessor. This will not record a
   * conformity claim without all three.
   */
  const assessClause = async (clause, status, patch = {}) => {
    // The assessor is settled BEFORE the gate (AS13): a blank name is the
    // user, a typed one is that person, and either replaces whoever
    // assessed the clause last time.
    const effective = ASSESSED_STATUSES.includes(status) ? withAssessor(patch, user?.id) : patch;
    const verdict = canSetClauseStatus(clause, status, effective);
    if (!verdict.ok) return { success: false, error: verdict.reason };

    const next = { ...clause, ...effective, status };

    const result = await updateClause(clause.id, next);
    if (result.success) {
      await logActivity('clause', clause.id,
        `Clause ${clause.clause_ref} assessed ${status}`,
        patch.evidence_reference ? { evidence: patch.evidence_reference } : null,
        { standard_id: clause.standard_id });
      await fetchAll();
    }
    return result;
  };

  const deleteClause = async (id) => {
    const { error: err } = await supabase.from('iso_clauses').delete().eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true };
  };

  /* ---------------------------------------------------------------- */
  /* Audits                                                           */
  /* ---------------------------------------------------------------- */

  const createAudit = async (form) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };

    for (let attempt = 0; attempt < CODE_RETRIES; attempt += 1) {
      let code;
      try {
        code = await issueCode('audit', attempt);
      } catch (err) {
        return { success: false, error: explainWriteError(err) };
      }
      const { row } = buildAuditWrite(form);
      const { data, error: err } = await supabase
        .from('iso_audits')
        .insert([{
          ...row,
          org_id: orgId,
          audit_code: code,
          created_by: user?.id || null,
          status: row.status || 'Planned',
        }])
        .select().single();
      if (err) {
        if (err.code === UNIQUE_VIOLATION && attempt < CODE_RETRIES - 1) continue;
        return { success: false, error: explainWriteError(err) };
      }
      await logActivity('audit', data.id, `${code} planned`, null,
        { audit_id: data.id, standard_id: data.standard_id });
      await fetchAll();
      return { success: true, data };
    }
    return { success: false, error: 'Could not allocate an audit number. Try again in a moment.' };
  };

  const updateAudit = async (id, form) => {
    const { row } = buildAuditWrite(form);
    const { data, error: err } = await supabase.from('iso_audits')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true, data };
  };

  /**
   * Move an audit, through the gate.
   *
   * canAdvanceAudit refuses a jump the workflow does not allow; for
   * Reported it refuses while a clause in scope has no result, and for
   * Closed while a major nonconformity it raised is open.
   */
  const advanceAudit = async (audit, to) => {
    const verdict = canAdvanceAudit(audit, to, {
      coverage: coverageWithClauses(audit.id),
      findings: findingsForAudit(audit.id),
    });
    if (!verdict.ok) return { success: false, error: verdict.reason };

    const patch = { ...audit, status: to };
    const todayIso = toDateOnlyString(new Date());
    if (to === 'In progress' && !patch.actual_start) patch.actual_start = todayIso;
    if (to === 'Fieldwork complete' && !patch.actual_end) patch.actual_end = todayIso;
    if (to === 'Reported') {
      if (!patch.report_issued_date) patch.report_issued_date = todayIso;
      patch.report_issued_by = patch.report_issued_by || user?.id || null;
    }
    if (to === 'Closed') {
      patch.closed_date = patch.closed_date || todayIso;
      patch.closed_by = patch.closed_by || user?.id || null;
    }

    const result = await updateAudit(audit.id, patch);
    if (result.success) {
      await logActivity('audit', audit.id, `${audit.audit_code} moved to ${to}`, null,
        { audit_id: audit.id, standard_id: audit.standard_id });
      await fetchAll();
    }
    return result;
  };

  /* ---------------------------------------------------------------- */
  /* Scope and coverage                                               */
  /* ---------------------------------------------------------------- */

  /**
   * Put clauses in an audit's scope.
   *
   * Refused once the audit is Reported, Closed or Cancelled: the scope is
   * what the report covered (scopeLockReason). Removal is refused the
   * same way.
   *
   * Refused where the lead auditor owns one of them. The database
   * refuses it too; this names the clauses first, which a constraint
   * cannot.
   */
  const addToScope = async (audit, clauseIds = []) => {
    // Judge the stored audit, not the caller's copy (AS13 hardening).
    const locked = scopeLockReason(audits.find((x) => x.id === audit?.id) || audit);
    if (locked) return { success: false, error: locked };
    const rows = clauseIds.filter(Boolean).map((id) => clauseById.get(id)).filter(Boolean);
    if (!rows.length) return { success: false, error: 'Pick at least one clause.' };

    // Picked ids, or the same typed name, are the same person (AS13).
    const view = independenceView(audit, rows);
    const verdict = auditIndependence(view.audit, view.clauses);
    if (!verdict.ok) return { success: false, error: verdict.reason };

    const payload = rows.map((c) => buildCoverageWrite({
      audit_id: audit.id, clause_id: c.id, result: 'Not examined',
    }).row);
    const { error: err } = await supabase.from('iso_audit_clauses').insert(payload);
    if (err) {
      if (err.code === UNIQUE_VIOLATION) {
        return { success: false, error: 'One of those clauses is already in this audit\'s scope.' };
      }
      return { success: false, error: explainWriteError(err) };
    }
    await logActivity('coverage', audit.id,
      `${rows.length} clause${rows.length === 1 ? '' : 's'} added to the scope of ${audit.audit_code}`,
      null, { audit_id: audit.id });
    await fetchAll();
    return { success: true };
  };

  const recordCoverage = async (row, patch) => {
    const { row: write } = buildCoverageWrite({ ...row, ...patch });
    if (write.result && write.result !== 'Not examined' && !write.examined_on) {
      write.examined_on = toDateOnlyString(new Date());
    }
    const { error: err } = await supabase.from('iso_audit_clauses')
      .update({ ...write, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (err) return { success: false, error: explainWriteError(err) };
    await logActivity('coverage', row.id,
      `Clause ${row.clause_ref || ''} examined: ${write.result}`.trim(), null,
      { audit_id: row.audit_id });
    await fetchAll();
    return { success: true };
  };

  const removeFromScope = async (id) => {
    const row = auditClauses.find((r) => r.id === id);
    const locked = scopeLockReason(audits.find((x) => x.id === row?.audit_id));
    if (locked) return { success: false, error: locked };
    const { error: err } = await supabase.from('iso_audit_clauses').delete().eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true };
  };

  /* ---------------------------------------------------------------- */
  /* Findings                                                         */
  /* ---------------------------------------------------------------- */

  const createFinding = async (raw, { actions: actionRows = [] } = {}) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };
    // A finding raised from an audit carries the audit's standard, so it
    // counts in that standard's readiness (AS13).
    const form = findingWithAuditStandard(raw, audits);

    for (let attempt = 0; attempt < CODE_RETRIES; attempt += 1) {
      let code;
      try {
        code = await issueCode('finding', attempt);
      } catch (err) {
        return { success: false, error: explainWriteError(err) };
      }
      const { row } = buildFindingWrite(form);
      const { data, error: err } = await supabase
        .from('iso_findings')
        .insert([{
          ...row,
          org_id: orgId,
          finding_code: code,
          raised_by: row.raised_by || user?.id || null,
          raised_date: row.raised_date || toDateOnlyString(new Date()),
          status: row.status || 'Open',
        }])
        .select().single();
      if (err) {
        if (err.code === UNIQUE_VIOLATION && attempt < CODE_RETRIES - 1) continue;
        return { success: false, error: explainWriteError(err) };
      }

      const warnings = [];
      if (actionRows.length) {
        const r = await addActions(data.id, actionRows, { skipRefresh: true });
        if (!r.success) warnings.push(r.error);
      }

      await logActivity('finding', data.id, `${code} raised: ${data.finding_type}`,
        { finding_type: data.finding_type },
        { finding_id: data.id, audit_id: data.audit_id, standard_id: data.standard_id });
      await fetchAll();
      return { success: true, data, warning: warnings.join(' ') || null };
    }
    return { success: false, error: 'Could not allocate a finding number. Try again in a moment.' };
  };

  const updateFinding = async (id, form) => {
    const { row } = buildFindingWrite(form);
    const { data, error: err } = await supabase.from('iso_findings')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true, data };
  };

  /**
   * Close a finding, through the gate.
   *
   * canCloseFinding refuses a nonconformity with no correction
   * recorded, and a major one until its root cause is written and a
   * corrective action has been verified effective.
   */
  const closeFinding = async (finding, { closure_notes } = {}) => {
    const verdict = canCloseFinding(finding, actionsFor(finding.id));
    if (!verdict.ok) return { success: false, error: verdict.reason };

    const result = await updateFinding(finding.id, {
      ...finding,
      status: 'Closed',
      closed_date: toDateOnlyString(new Date()),
      closed_by: user?.id || null,
      closure_notes: closure_notes || finding.closure_notes || null,
    });
    if (result.success) {
      await logActivity('finding', finding.id, `${finding.finding_code} closed`, null,
        { finding_id: finding.id, audit_id: finding.audit_id });
      await fetchAll();
    }
    return result;
  };

  /** Void one raised in error. The honest alternative to closing it. */
  const voidFinding = async (finding, reason) => {
    if (!String(reason || '').trim()) {
      return { success: false, error: 'Say why this was raised in error.' };
    }
    const result = await updateFinding(finding.id, {
      ...finding, status: 'Voided', closure_notes: reason,
    });
    if (result.success) {
      await logActivity('finding', finding.id, `${finding.finding_code} voided`, { reason },
        { finding_id: finding.id, audit_id: finding.audit_id });
      await fetchAll();
    }
    return result;
  };

  /**
   * Only a finding raised in error with nothing recorded against it.
   * Anything else is voided with a reason (AS13: AS8 deleted in any
   * status on one click, which let an audit close over an open major).
   */
  const deleteFinding = async (id) => {
    const finding = findings.find((f) => f.id === id);
    if (!finding) return { success: false, error: 'That finding is not in this register.' };
    const audit = finding.audit_id ? audits.find((a) => a.id === finding.audit_id) || null : null;
    const verdict = canDeleteFinding(finding, audit, actionsFor(id));
    if (!verdict.ok) return { success: false, error: verdict.reason };
    const { error: err } = await supabase.from('iso_findings').delete().eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await logActivity('finding', id, `${finding.finding_code} deleted (raised in error)`, null,
      { audit_id: finding.audit_id, standard_id: finding.standard_id });
    await fetchAll();
    return { success: true };
  };

  /**
   * Move an open finding to where its record says it is: Action in
   * progress while an action is open, Verification once every action is
   * finished. Reads the rows back, because it runs straight after the
   * write that changed them.
   */
  const syncFindingStatus = async (findingId) => {
    if (!findingId) return;
    const [fRes, aRes] = await Promise.all([
      supabase.from('iso_findings').select('*').eq('id', findingId).single(),
      supabase.from('iso_actions').select('*').eq('finding_id', findingId),
    ]);
    if (fRes.error || aRes.error || !fRes.data) return;
    const status = progressedFindingStatus(fRes.data, aRes.data || []);
    if (status === fRes.data.status) return;
    const { error: err } = await supabase.from('iso_findings')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', findingId);
    if (!err) {
      await logActivity('finding', findingId, `${fRes.data.finding_code} is now ${status}`, null,
        { finding_id: findingId, audit_id: fRes.data.audit_id });
    }
  };

  /* ---------------------------------------------------------------- */
  /* Actions                                                          */
  /* ---------------------------------------------------------------- */

  const addActions = async (findingId, rows, { skipRefresh = false } = {}) => {
    const payload = rows
      .filter((a) => String(a.description || '').trim())
      .map((a) => buildActionWrite({
        ...a,
        finding_id: findingId,
        action_type: a.action_type || 'Corrective',
        status: a.status || 'Open',
      }).row);
    if (!payload.length) return { success: true };
    const { error: err } = await supabase.from('iso_actions').insert(payload);
    if (err) {
      return { success: false, error: `The actions were not saved: ${explainWriteError(err)}` };
    }
    await syncFindingStatus(findingId);
    if (!skipRefresh) await fetchAll();
    return { success: true };
  };

  const updateAction = async (id, patch) => {
    const { row } = buildActionWrite(patch);
    if (patch.status === 'Complete' && !row.completed_at) {
      row.completed_at = new Date().toISOString();
    }
    const { error: err } = await supabase.from('iso_actions')
      .update({ ...row, updated_at: new Date().toISOString() }).eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await syncFindingStatus(patch.finding_id || actions.find((a) => a.id === id)?.finding_id);
    await fetchAll();
    return { success: true };
  };

  /**
   * Record the effectiveness check.
   *
   * Three-state and all three meaningful: it worked, it did not, and
   * nobody has been back to see. The date and the checker are written
   * here rather than left to the form, because the database refuses
   * the row without them.
   */
  const recordEffectiveness = async (action, verified, notes) => {
    if (verified !== true && verified !== false) {
      return { success: false, error: 'Record whether the action was effective or not.' };
    }
    if (verified === false && !String(notes || '').trim()) {
      return {
        success: false,
        error: 'Say what is still happening. A "not effective" verdict is the trigger to '
          + 'raise another action, so the next person needs to know what was seen.',
      };
    }
    const result = await updateAction(action.id, {
      effectiveness_verified: verified,
      effectiveness_checked_at: toDateOnlyString(new Date()),
      effectiveness_verified_by: user?.id || null,
      effectiveness_notes: notes || null,
    });
    if (result.success) {
      await logActivity('action', action.id,
        verified ? 'Action verified effective' : 'Action found NOT effective',
        notes ? { notes } : null, { finding_id: action.finding_id });
      await fetchAll();
    }
    return result;
  };

  const deleteAction = async (id) => {
    const findingId = actions.find((a) => a.id === id)?.finding_id;
    const { error: err } = await supabase.from('iso_actions').delete().eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await syncFindingStatus(findingId);
    await fetchAll();
    return { success: true };
  };

  return {
    orgId,
    userId: user?.id || null,
    standards,
    clauses,
    audits,
    auditClauses,
    findings: findingsWithActions,
    rawFindings: findings,
    actions,
    activity,
    loading,
    error,
    hasAs8Schema,
    refresh: fetchAll,
    clausesFor,
    coverageFor,
    coverageWithClauses,
    findingsForAudit,
    findingsForClause,
    actionsFor,
    activityFor,
    createStandard,
    updateStandard,
    deleteStandard,
    createClause,
    assessClause,
    deleteClause,
    createAudit,
    updateAudit,
    advanceAudit,
    addToScope,
    recordCoverage,
    removeFromScope,
    createFinding,
    updateFinding,
    closeFinding,
    voidFinding,
    deleteFinding,
    addActions,
    updateAction,
    recordEffectiveness,
    deleteAction,
  };
};

export default useIsoCompliance;
