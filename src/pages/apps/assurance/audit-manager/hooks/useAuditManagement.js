import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  auditIndependence,
  canAdvanceAudit,
  canAdvanceProgramme,
  canCloseFinding,
  canRaiseFinding,
} from '@/lib/auditManagement';
import {
  buildActionWrite,
  buildAuditWrite,
  buildFindingWrite,
  buildProgrammeWrite,
  buildResponseWrite,
  buildTemplateItemWrite,
  buildTemplateWrite,
  auditAcceptsWork,
  auditLockedReason,
  canChangeItemCriticality,
  canDeleteFinding,
  canDeleteTemplateItem,
  independenceSubject,
  nextAuditCodeFromExisting,
  nextFindingCodeFromExisting,
  progressedFindingStatus,
} from '../utils/auditPayload';

const UNKNOWN_RELATION = 'PGRST200';
const UNDEFINED_TABLE = '42P01';
const UNDEFINED_FUNCTION = '42883';
const UNIQUE_VIOLATION = '23505';
/** Postgres: check constraint violated — what all four AS10 triggers raise. */
const CHECK_VIOLATION = '23514';
/** Postgres: insufficient privilege — what the cross-tenant triggers raise. */
const INSUFFICIENT_PRIVILEGE = '42501';

const CODE_RETRIES = 3;

/**
 * AS10 — the one place this app reads and writes.
 *
 * There is nothing to replace: both tiles this app comes from were
 * sold with no code of any kind behind them, so this hook is the first
 * query the Audit & Findings Manager has ever issued.
 *
 * `hasAs10Schema` is false while migration 20260917800000 is
 * unapplied, and the app says so rather than showing anything.
 */
export const useAuditManagement = () => {
  const { organization, user } = useAuth();
  const orgId = organization?.id || null;

  const [programmes, setProgrammes] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templateItems, setTemplateItems] = useState([]);
  const [audits, setAudits] = useState([]);
  const [responses, setResponses] = useState([]);
  const [findings, setFindings] = useState([]);
  const [actions, setActions] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasAs10Schema, setHasAs10Schema] = useState(true);

  const clearAll = () => {
    setProgrammes([]); setTemplates([]); setTemplateItems([]); setAudits([]);
    setResponses([]); setFindings([]); setActions([]); setActivity([]);
  };

  const fetchAll = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const programmeRes = await supabase
        .from('audit_programmes')
        .select('*')
        .eq('org_id', orgId)
        .order('programme_year', { ascending: false });

      if (programmeRes.error) {
        if (programmeRes.error.code === UNDEFINED_TABLE
            || programmeRes.error.code === UNKNOWN_RELATION) {
          setHasAs10Schema(false);
          clearAll();
          setLoading(false);
          return;
        }
        throw programmeRes.error;
      }
      setHasAs10Schema(true);

      const [templateRes, auditRes, findingRes, logRes] = await Promise.all([
        supabase.from('audit_templates').select('*').eq('org_id', orgId)
          .order('code', { ascending: true }),
        supabase.from('audit_records').select('*').eq('org_id', orgId)
          .order('planned_start', { ascending: false, nullsFirst: false }),
        supabase.from('audit_findings').select('*').eq('org_id', orgId)
          .order('raised_date', { ascending: false }),
        supabase.from('audit_activity_log').select('*').eq('org_id', orgId)
          .order('created_at', { ascending: false }).limit(300),
      ]);
      if (templateRes.error) throw templateRes.error;
      if (auditRes.error) throw auditRes.error;
      if (findingRes.error) throw findingRes.error;
      if (logRes.error) throw logRes.error;

      const templateRows = templateRes.data || [];
      const auditRows = auditRes.data || [];
      const findingRows = findingRes.data || [];

      let itemRows = [];
      if (templateRows.length) {
        const res = await supabase.from('audit_template_items').select('*')
          .in('template_id', templateRows.map((t) => t.id))
          .order('sequence', { ascending: true, nullsFirst: false });
        if (res.error) throw res.error;
        itemRows = res.data || [];
      }

      let responseRows = [];
      if (auditRows.length) {
        const res = await supabase.from('audit_responses').select('*')
          .in('audit_id', auditRows.map((a) => a.id));
        if (res.error) throw res.error;
        responseRows = res.data || [];
      }

      let actionRows = [];
      if (findingRows.length) {
        const res = await supabase.from('audit_actions').select('*')
          .in('finding_id', findingRows.map((f) => f.id))
          .order('due_date', { ascending: true, nullsFirst: false });
        if (res.error) throw res.error;
        actionRows = res.data || [];
      }

      setProgrammes(programmeRes.data || []);
      setTemplates(templateRows);
      setTemplateItems(itemRows);
      setAudits(auditRows);
      setResponses(responseRows);
      setFindings(findingRows);
      setActions(actionRows);
      setActivity(logRes.data || []);
    } catch (err) {
      // An organization with no audit programme has no audit programme.
      setError(err.message || 'Could not load the audit register.');
      clearAll();
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const itemsFor = useCallback(
    (templateId) => templateItems
      .filter((i) => i.template_id === templateId)
      .sort((a, b) => {
        const s = (a.sequence ?? 0) - (b.sequence ?? 0);
        if (s !== 0) return s;
        return String(a.item_no).localeCompare(String(b.item_no), undefined, { numeric: true });
      }),
    [templateItems]);
  const responsesFor = useCallback(
    (auditId) => responses.filter((r) => r.audit_id === auditId), [responses]);
  const findingsForAudit = useCallback(
    (auditId) => findings.filter((f) => f.audit_id === auditId), [findings]);
  const findingsForResponse = useCallback(
    (responseId) => findings.filter((f) => f.response_id === responseId), [findings]);
  const auditsForProgramme = useCallback(
    (programmeId) => audits.filter((a) => a.programme_id === programmeId), [audits]);
  const actionsFor = useCallback(
    (findingId) => actions.filter((a) => a.finding_id === findingId), [actions]);
  const activityFor = useCallback(
    (entityId) => activity.filter(
      (a) => a.entity_id === entityId || a.audit_id === entityId
        || a.finding_id === entityId || a.programme_id === entityId),
    [activity]);

  const findingsWithActions = useMemo(
    () => findings.map((f) => ({ ...f, actions: actionsFor(f.id) })),
    [findings, actionsFor]);

  const logActivity = async (entityType, entityId, action, details, keys = {}) => {
    if (!orgId) return;
    await supabase.from('audit_activity_log').insert([{
      org_id: orgId,
      entity_type: entityType,
      entity_id: entityId,
      programme_id: keys.programme_id || null,
      audit_id: keys.audit_id || null,
      finding_id: keys.finding_id || null,
      actor_id: user?.id || null,
      action,
      details: details || null,
    }]);
  };

  /**
   * A constraint or trigger failure means the database refused
   * something the form should have caught first. The four AS10
   * triggers already raise sentences written for a user, so those are
   * passed through unchanged.
   */
  const explainWriteError = (err) => {
    if (err.code === INSUFFICIENT_PRIVILEGE) {
      return err.message || 'That record belongs to another organization.';
    }
    if (err.code === CHECK_VIOLATION
        && /checklist item|own area|programme|Nonconformant/.test(err.message)) {
      return err.message;
    }
    if (err.code !== CHECK_VIOLATION) return err.message;
    if (/answer_needs_date/.test(err.message)) {
      return 'Record the date this item was examined.';
    }
    if (/na_needs_reason/.test(err.message)) {
      return 'Say why this item does not apply. "Not applicable" is an answer, and an answer '
        + 'has a reason.';
    }
    if (/nonconformity_needs_evidence/.test(err.message)) {
      return 'A nonconformity needs the evidence for it: what was seen, where, and when.';
    }
    if (/stop_work_needs_correction/.test(err.message)) {
      return 'A finding that stopped work records what was done about it at the time.';
    }
    if (/stop_work_is_a_nonconformity/.test(err.message)) {
      return 'A finding that stopped work is a nonconformity, not an observation.';
    }
    if (/report_needs_record/.test(err.message)) {
      return 'A reported audit needs the report date, a named lead auditor and the conclusion.';
    }
    if (/cancel_needs_reason/.test(err.message)) {
      return 'Say why this audit is not being done.';
    }
    if (/findings_closure_needs_record/.test(err.message)) {
      return 'Closing a nonconformity needs the correction recorded, and a major one needs '
        + 'the root cause as well.';
    }
    if (/void_needs_reason/.test(err.message)) {
      return 'Say why this finding was raised in error.';
    }
    if (/approval_needs_record/.test(err.message)) {
      return 'An approved programme needs the date it was approved and who approved it.';
    }
    if (/effectiveness_needs_record/.test(err.message)) {
      return 'An effectiveness check needs the date it was made and who made it, whether the '
        + 'verdict is effective or not effective.';
    }
    if (/complete_needs_date/.test(err.message)) {
      return 'Record when it was completed.';
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
    const fn = kind === 'audit' ? 'next_audit_code' : 'next_audit_finding_code';
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
  /* Programmes                                                       */
  /* ---------------------------------------------------------------- */

  const createProgramme = async (form) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };
    const { row } = buildProgrammeWrite(form);
    const { data, error: err } = await supabase
      .from('audit_programmes')
      .insert([{
        ...row, org_id: orgId, created_by: user?.id || null, status: row.status || 'Draft',
      }])
      .select().single();
    if (err) {
      if (err.code === UNIQUE_VIOLATION) {
        return { success: false, error: 'That programme already exists for this year.' };
      }
      return { success: false, error: explainWriteError(err) };
    }
    await logActivity('programme', data.id, `${data.title} created`, null,
      { programme_id: data.id });
    await fetchAll();
    return { success: true, data };
  };

  const updateProgramme = async (id, form) => {
    const { row } = buildProgrammeWrite(form);
    const { data, error: err } = await supabase.from('audit_programmes')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true, data };
  };

  /**
   * Move a programme, through the gate.
   *
   * canAdvanceProgramme refuses completion while an audit in it is
   * neither reported nor cancelled with a reason.
   */
  const advanceProgramme = async (programme, to, patch = {}) => {
    // "Leave blank to record yourself" is applied BEFORE the gate. AS10
    // filled approved_by after canApproveProgramme had already refused
    // the blank name, so the promise on the form could never be kept.
    const todayIso = new Date().toISOString().slice(0, 10);
    const effective = { ...patch };
    if (to === 'Approved') {
      const merged = { ...programme, ...patch };
      if (!merged.approved_at) effective.approved_at = todayIso;
      if (!merged.approved_by && !String(merged.approver_name || '').trim() && user?.id) {
        effective.approved_by = user.id;
      }
    }

    const verdict = canAdvanceProgramme(programme, to, {
      audits: auditsForProgramme(programme.id),
      patch: effective,
    });
    if (!verdict.ok) return { success: false, error: verdict.reason };

    const next = { ...programme, ...effective, status: to };
    if (to === 'Complete' && !next.completed_at) next.completed_at = todayIso;

    const result = await updateProgramme(programme.id, next);
    if (result.success) {
      await logActivity('programme', programme.id, `${programme.title} moved to ${to}`, null,
        { programme_id: programme.id });
      await fetchAll();
    }
    return result;
  };

  const deleteProgramme = async (id) => {
    const { error: err } = await supabase.from('audit_programmes').delete().eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true };
  };

  /* ---------------------------------------------------------------- */
  /* Checklists                                                       */
  /* ---------------------------------------------------------------- */

  const createTemplate = async (form) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };
    const { row } = buildTemplateWrite(form);
    const { data, error: err } = await supabase
      .from('audit_templates')
      .insert([{
        ...row, org_id: orgId, created_by: user?.id || null, status: row.status || 'Draft',
      }])
      .select().single();
    if (err) {
      if (err.code === UNIQUE_VIOLATION) {
        return { success: false, error: `Checklist ${form.code} already exists.` };
      }
      return { success: false, error: explainWriteError(err) };
    }
    await logActivity('template', data.id, `Checklist ${data.code} created`);
    await fetchAll();
    return { success: true, data };
  };

  const updateTemplate = async (id, form) => {
    const { row } = buildTemplateWrite(form);
    const { data, error: err } = await supabase.from('audit_templates')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true, data };
  };

  const deleteTemplate = async (id) => {
    const { error: err } = await supabase.from('audit_templates').delete().eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true };
  };

  const addTemplateItems = async (templateId, rows, { skipRefresh = false } = {}) => {
    const existing = itemsFor(templateId).length;
    const payload = rows
      .filter((r) => String(r.question || '').trim())
      .map((r, index) => buildTemplateItemWrite({
        ...r,
        template_id: templateId,
        sequence: r.sequence ?? existing + index + 1,
        criticality: r.criticality || 'Minor',
      }).row);
    if (!payload.length) return { success: true };
    const { error: err } = await supabase.from('audit_template_items').insert(payload);
    if (err) {
      if (err.code === UNIQUE_VIOLATION) {
        return { success: false, error: 'One of those item numbers is already in this checklist.' };
      }
      return { success: false, error: explainWriteError(err) };
    }
    if (!skipRefresh) await fetchAll();
    return { success: true };
  };

  const updateTemplateItem = async (id, patch) => {
    const current = templateItems.find((i) => i.id === id);
    if (current && patch.criticality && patch.criticality !== current.criticality) {
      const verdict = canChangeItemCriticality(current, responses, audits);
      if (!verdict.ok) return { success: false, error: verdict.reason };
    }
    const { row } = buildTemplateItemWrite(patch);
    const { error: err } = await supabase.from('audit_template_items')
      .update({ ...row, updated_at: new Date().toISOString() }).eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true };
  };

  /**
   * Refused for a question any audit has used: the foreign key from
   * audit_responses cascades, so the delete would take the answers in
   * reported and closed audits with it.
   */
  const deleteTemplateItem = async (id) => {
    const current = templateItems.find((i) => i.id === id);
    if (!current) return { success: false, error: 'That question is not in this checklist.' };
    const verdict = canDeleteTemplateItem(current, responses, audits);
    if (!verdict.ok) return { success: false, error: verdict.reason };
    const { error: err } = await supabase.from('audit_template_items').delete().eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true };
  };

  /* ---------------------------------------------------------------- */
  /* Audits                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Plan an audit.
   *
   * Refused where the lead auditor is also the auditee. The database
   * refuses it too; this says so before the row is attempted.
   */
  const createAudit = async (form) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };
    // Ids where the form picked Suite members; the same typed name on
    // both sides where it did not (AS13: AS10's form set names only, so
    // the id comparison never had anything to compare).
    const independence = auditIndependence(independenceSubject(form));
    if (!independence.ok) return { success: false, error: independence.reason };

    for (let attempt = 0; attempt < CODE_RETRIES; attempt += 1) {
      let code;
      try {
        code = await issueCode('audit', attempt);
      } catch (err) {
        return { success: false, error: explainWriteError(err) };
      }
      const { row } = buildAuditWrite(form);
      const { data, error: err } = await supabase
        .from('audit_records')
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

      // The checklist is written out the moment the audit is planned,
      // so an auditor opens a protocol rather than an empty page.
      const warnings = [];
      if (data.template_id) {
        const opened = await openChecklist(data, { skipRefresh: true });
        if (!opened.success) warnings.push(opened.error);
      }

      await logActivity('audit', data.id, `${code} planned`, null,
        { audit_id: data.id, programme_id: data.programme_id });
      await fetchAll();
      return { success: true, data, warning: warnings.join(' ') || null };
    }
    return { success: false, error: 'Could not allocate an audit number. Try again in a moment.' };
  };

  const updateAudit = async (id, form) => {
    const { row } = buildAuditWrite(form);
    const { data, error: err } = await supabase.from('audit_records')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true, data };
  };

  /**
   * Write one response row per checklist item, so the protocol exists
   * before anybody starts answering it. Items added to the checklist
   * later are picked up on the next call.
   */
  const openChecklist = async (audit, { skipRefresh = false } = {}) => {
    if (!audit.template_id) {
      return { success: false, error: 'This audit has no checklist to open.' };
    }
    const items = itemsFor(audit.template_id);
    if (!items.length) {
      return { success: false, error: 'That checklist has no items in it yet.' };
    }
    const already = new Set(responsesFor(audit.id).map((r) => r.item_id));
    const payload = items
      .filter((i) => !already.has(i.id))
      .map((i) => buildResponseWrite({
        audit_id: audit.id, item_id: i.id, result: 'Not examined',
      }).row);
    if (!payload.length) return { success: true };

    const { error: err } = await supabase.from('audit_responses').insert(payload);
    if (err) return { success: false, error: explainWriteError(err) };
    if (!skipRefresh) await fetchAll();
    return { success: true };
  };

  /** Record one answer. The gates are the database's and the form's. */
  const recordAnswer = async (response, patch) => {
    const audit = audits.find((a) => a.id === response.audit_id) || null;
    if (!auditAcceptsWork(audit)) return { success: false, error: auditLockedReason(audit) };
    const { row } = buildResponseWrite({ ...response, ...patch });
    if (row.result && row.result !== 'Not examined' && !row.examined_on) {
      row.examined_on = new Date().toISOString().slice(0, 10);
    }
    if (row.result && row.result !== 'Not examined' && !row.examined_by) {
      row.examined_by = user?.id || null;
    }
    const { error: err } = await supabase.from('audit_responses')
      .update({ ...row, updated_at: new Date().toISOString() }).eq('id', response.id);
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true };
  };

  /**
   * There is deliberately no deleteAudit. An audit that is not going
   * to happen is CANCELLED, with a reason, because that is what rule 5
   * counts: a programme whose audits can be deleted is a programme
   * that can always be reported as complete.
   */

  /**
   * Move an audit, through the gate.
   *
   * canAdvanceAudit refuses a report while the checklist has unanswered
   * items or a critical nonconformance with no finding, and refuses
   * closure over an open major or stop-work finding.
   */
  const advanceAudit = async (audit, to, patch = {}) => {
    const items = audit.template_id ? itemsFor(audit.template_id) : [];
    const verdict = canAdvanceAudit({ ...audit, ...patch }, to, {
      items,
      responses: responsesFor(audit.id),
      findings: findingsForAudit(audit.id),
      patch,
    });
    if (!verdict.ok) return { success: false, error: verdict.reason };

    const next = { ...audit, ...patch, status: to };
    const todayIso = new Date().toISOString().slice(0, 10);
    if (to === 'In progress' && !next.actual_start) next.actual_start = todayIso;
    if (to === 'Fieldwork complete' && !next.actual_end) next.actual_end = todayIso;
    if (to === 'Reported') {
      if (!next.report_issued_date) next.report_issued_date = todayIso;
      next.report_issued_by = next.report_issued_by || user?.id || null;
    }
    if (to === 'Closed') {
      next.closed_date = next.closed_date || todayIso;
      next.closed_by = next.closed_by || user?.id || null;
    }

    const result = await updateAudit(audit.id, next);
    if (result.success) {
      await logActivity('audit', audit.id, `${audit.audit_code} moved to ${to}`,
        patch.cancellation_reason ? { reason: patch.cancellation_reason } : null,
        { audit_id: audit.id, programme_id: audit.programme_id });
      await fetchAll();
    }
    return result;
  };

  /* ---------------------------------------------------------------- */
  /* Findings                                                         */
  /* ---------------------------------------------------------------- */

  const createFinding = async (form, { actions: actionRows = [] } = {}) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };
    const verdict = canRaiseFinding(form);
    if (!verdict.ok) return { success: false, error: verdict.reason };
    if (form.audit_id) {
      const audit = audits.find((a) => a.id === form.audit_id) || null;
      if (!auditAcceptsWork(audit)) return { success: false, error: auditLockedReason(audit) };
    }

    for (let attempt = 0; attempt < CODE_RETRIES; attempt += 1) {
      let code;
      try {
        code = await issueCode('finding', attempt);
      } catch (err) {
        return { success: false, error: explainWriteError(err) };
      }
      const { row } = buildFindingWrite(form);
      const { data, error: err } = await supabase
        .from('audit_findings')
        .insert([{
          ...row,
          org_id: orgId,
          finding_code: code,
          raised_by: row.raised_by || user?.id || null,
          raised_date: row.raised_date || new Date().toISOString().slice(0, 10),
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

      await logActivity('finding', data.id,
        `${code} raised${data.stop_work ? ' (work stopped)' : ''}: ${data.finding_type}`,
        { finding_type: data.finding_type, stop_work: data.stop_work },
        { finding_id: data.id, audit_id: data.audit_id });
      await fetchAll();
      return { success: true, data, warning: warnings.join(' ') || null };
    }
    return { success: false, error: 'Could not allocate a finding number. Try again in a moment.' };
  };

  const updateFinding = async (id, form) => {
    const { row } = buildFindingWrite(form);
    const { data, error: err } = await supabase.from('audit_findings')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true, data };
  };

  /** Close a finding, through AS8's gate. */
  const closeFinding = async (finding, { closure_notes } = {}) => {
    const verdict = canCloseFinding(finding, actionsFor(finding.id));
    if (!verdict.ok) return { success: false, error: verdict.reason };

    const result = await updateFinding(finding.id, {
      ...finding,
      status: 'Closed',
      closed_date: new Date().toISOString().slice(0, 10),
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
   * Anything else is voided with a reason (AS13: AS10 deleted in any
   * status on one click, so an open major or stop-work finding could be
   * deleted and its audit closed over it).
   */
  const deleteFinding = async (id) => {
    const finding = findings.find((f) => f.id === id);
    if (!finding) return { success: false, error: 'That finding is not in this register.' };
    const audit = finding.audit_id ? audits.find((a) => a.id === finding.audit_id) || null : null;
    const verdict = canDeleteFinding(finding, audit, actionsFor(id));
    if (!verdict.ok) return { success: false, error: verdict.reason };
    const { error: err } = await supabase.from('audit_findings').delete().eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await logActivity('finding', id, `${finding.finding_code} deleted (raised in error)`, null,
      { audit_id: finding.audit_id });
    await fetchAll();
    return { success: true };
  };

  /**
   * Move an open finding to where its record says it is: Action in
   * progress while an action is open, Verification once every action is
   * finished. Reads the rows back rather than trusting local state,
   * because it runs straight after the write that changed them.
   */
  const syncFindingStatus = async (findingId) => {
    if (!findingId) return;
    const [fRes, aRes] = await Promise.all([
      supabase.from('audit_findings').select('*').eq('id', findingId).single(),
      supabase.from('audit_actions').select('*').eq('finding_id', findingId),
    ]);
    if (fRes.error || aRes.error || !fRes.data) return;
    const status = progressedFindingStatus(fRes.data, aRes.data || []);
    if (status === fRes.data.status) return;
    const { error: err } = await supabase.from('audit_findings')
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
    const { error: err } = await supabase.from('audit_actions').insert(payload);
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
    const { error: err } = await supabase.from('audit_actions')
      .update({ ...row, updated_at: new Date().toISOString() }).eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await syncFindingStatus(patch.finding_id || actions.find((a) => a.id === id)?.finding_id);
    await fetchAll();
    return { success: true };
  };

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
      effectiveness_checked_at: new Date().toISOString().slice(0, 10),
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
    const { error: err } = await supabase.from('audit_actions').delete().eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await syncFindingStatus(findingId);
    await fetchAll();
    return { success: true };
  };

  return {
    orgId,
    userId: user?.id || null,
    programmes,
    templates,
    templateItems,
    audits,
    responses,
    findings: findingsWithActions,
    rawFindings: findings,
    actions,
    activity,
    loading,
    error,
    hasAs10Schema,
    refresh: fetchAll,
    itemsFor,
    responsesFor,
    findingsForAudit,
    findingsForResponse,
    auditsForProgramme,
    actionsFor,
    activityFor,
    createProgramme,
    updateProgramme,
    advanceProgramme,
    deleteProgramme,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    addTemplateItems,
    updateTemplateItem,
    deleteTemplateItem,
    createAudit,
    updateAudit,
    openChecklist,
    recordAnswer,
    advanceAudit,
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

export default useAuditManagement;
