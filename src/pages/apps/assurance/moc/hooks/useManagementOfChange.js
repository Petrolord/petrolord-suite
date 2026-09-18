import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { canAdvance } from '@/lib/managementOfChange';
import {
  buildActionWrite,
  buildApprovalWrite,
  buildImpactWrite,
  buildMocWrite,
  mocLockReason,
  nextCodeFromExisting,
  validateExpiryEdit,
} from '../utils/mocPayload';

const UNKNOWN_COLUMN = 'PGRST204';
const UNKNOWN_RELATION = 'PGRST200';
const UNDEFINED_TABLE = '42P01';
const UNDEFINED_FUNCTION = '42883';
const UNIQUE_VIOLATION = '23505';
/** Postgres: check constraint violated. */
const CHECK_VIOLATION = '23514';

const CODE_RETRIES = 3;

/**
 * AS6 — the one place this app reads and writes.
 *
 * There was nothing to replace. `Management of Change` issued no
 * queries at all: seven moc_* tables existed and not one page touched
 * any of them. The register was five hardcoded rows, the dashboard's
 * tiles were 42 / 12 / 5 / 128, the approval queue was two hardcoded
 * tasks, the detail page defaulted its own id to 'MOC-2026-089', and
 * the create form had no state.
 *
 * The app also exported: the register offered CSV, Excel and PDF of
 * those five invented change records, including an Emergency
 * "Temporary pipeline clamp" at High risk. An MOC register is the
 * document that proves a facility's changes were controlled.
 */
export const useManagementOfChange = () => {
  const { organization, user } = useAuth();
  const orgId = organization?.id || null;

  const [records, setRecords] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [actions, setActions] = useState([]);
  const [impacts, setImpacts] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasAs6Schema, setHasAs6Schema] = useState(true);

  const optional = async (promise) => {
    const res = await promise;
    if (res.error) {
      if (res.error.code === UNDEFINED_TABLE || res.error.code === UNKNOWN_RELATION) {
        return { data: [], missing: true };
      }
      throw res.error;
    }
    return { data: res.data || [], missing: false };
  };

  const fetchAll = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await supabase
        .from('moc_records')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      if (res.error) throw res.error;
      const rows = res.data || [];

      let as6 = rows.length === 0 || 'current_situation' in rows[0];
      const ids = rows.map((r) => r.id);

      let approvalRows = [];
      let actionRows = [];
      let impactRows = [];
      let activityRows = [];
      if (ids.length) {
        const a = await optional(supabase
          .from('moc_approvals').select('*').in('moc_id', ids)
          .order('level', { ascending: true }));
        approvalRows = a.data;

        const ac = await optional(supabase
          .from('moc_actions').select('*').in('moc_id', ids)
          .order('due_date', { ascending: true, nullsFirst: false }));
        actionRows = ac.data;

        const im = await optional(supabase
          .from('moc_impacts').select('*').in('moc_id', ids));
        impactRows = im.data;

        const lg = await optional(supabase
          .from('moc_activity_log').select('*').in('moc_id', ids)
          .order('created_at', { ascending: false }).limit(200));
        activityRows = lg.data;
      }

      setRecords(rows);
      setApprovals(approvalRows);
      setActions(actionRows);
      setImpacts(impactRows);
      setActivity(activityRows);
      setHasAs6Schema(as6);
    } catch (err) {
      // An empty register is empty. A broken one says so.
      setError(err.message || 'Could not load the change register.');
      setRecords([]);
      setApprovals([]);
      setActions([]);
      setImpacts([]);
      setActivity([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const approvalsFor = useCallback(
    (mocId) => approvals.filter((a) => a.moc_id === mocId), [approvals]);
  const actionsFor = useCallback(
    (mocId) => actions.filter((a) => a.moc_id === mocId), [actions]);
  const impactsFor = useCallback(
    (mocId) => impacts.filter((a) => a.moc_id === mocId), [impacts]);
  const activityFor = useCallback(
    (mocId) => activity.filter((a) => a.moc_id === mocId), [activity]);

  const recordsWithChildren = useMemo(
    () => records.map((m) => ({
      ...m,
      approvals: approvalsFor(m.id),
      actions: actionsFor(m.id),
      impacts: impactsFor(m.id),
    })),
    [records, approvalsFor, actionsFor, impactsFor],
  );

  const logActivity = async (mocId, action, details) => {
    // Best effort: a logging failure must never make a real write
    // report as failed.
    await supabase.from('moc_activity_log').insert([{
      moc_id: mocId,
      actor_id: user?.id || null,
      action,
      details: details || null,
    }]);
  };

  const issueCode = async (attempt) => {
    const year = new Date().getFullYear();
    const { data, error: err } = await supabase.rpc('next_moc_code', {
      p_org: orgId, p_year: year,
    });
    if (!err && data) return data;
    if (err && err.code !== UNDEFINED_FUNCTION) throw err;
    const fallback = nextCodeFromExisting(records, year);
    if (attempt === 0) return fallback;
    const m = /^MOC-(\d+)-(\d+)$/.exec(fallback);
    return `MOC-${m[1]}-${String(Number(m[2]) + attempt).padStart(3, '0')}`;
  };

  /**
   * A check-constraint failure means the database refused something the
   * form should have caught. Naming it beats showing a constraint name.
   */
  const explainWriteError = (err) => {
    if (err.code !== CHECK_VIOLATION) return err.message;
    if (/temporary_needs_expiry/.test(err.message)) {
      return 'A temporary or emergency change needs an expiry date once it leaves Draft. '
        + 'Without one it is a permanent change nobody decided to make.';
    }
    if (/_stage_check|_type_check|_category_check|_risk_check|_priority_check/.test(err.message)) {
      return 'One of the values on this change is not one the register accepts. '
        + 'Check the type, category, stage, risk and priority.';
    }
    return err.message;
  };

  const createMoc = async (form, { impacts: impactRows = [], actions: actionRows = [] } = {}) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };
    let as6 = hasAs6Schema;

    for (let attempt = 0; attempt < CODE_RETRIES; attempt += 1) {
      let code;
      try {
        code = await issueCode(attempt);
      } catch (err) {
        return { success: false, error: err.message };
      }

      const { row } = buildMocWrite(form, { hasAs6Columns: as6 });
      const { data, error: err } = await supabase
        .from('moc_records')
        .insert([{
          ...row,
          org_id: orgId,
          moc_code: code,
          created_by: user?.id || null,
          originator_id: row.originator_id || user?.id || null,
          stage: row.stage || 'Draft',
        }])
        .select()
        .single();

      if (err) {
        if (err.code === UNKNOWN_COLUMN && as6) {
          as6 = false; setHasAs6Schema(false); continue;
        }
        if (err.code === UNIQUE_VIOLATION && attempt < CODE_RETRIES - 1) continue;
        return { success: false, error: explainWriteError(err) };
      }

      const warnings = [];
      if (impactRows.length) {
        const r = await addImpacts(data.id, impactRows, { skipRefresh: true });
        if (!r.success) warnings.push(r.error);
      }
      if (actionRows.length) {
        const r = await addActions(data.id, actionRows, { skipRefresh: true });
        if (!r.success) warnings.push(r.error);
      }

      await logActivity(data.id, 'Change request raised', { moc_code: code });
      await fetchAll();
      return { success: true, data, warning: warnings.join(' ') || null };
    }
    return { success: false, error: 'Could not allocate an MOC number. Try again in a moment.' };
  };

  const updateMoc = async (id, form) => {
    let as6 = hasAs6Schema;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { row } = buildMocWrite(form, { hasAs6Columns: as6 });
      const { data, error: err } = await supabase
        .from('moc_records')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', id).select().single();
      if (!err) {
        await fetchAll();
        return { success: true, data };
      }
      if (err.code === UNKNOWN_COLUMN && as6) {
        as6 = false; setHasAs6Schema(false); continue;
      }
      return { success: false, error: explainWriteError(err) };
    }
    return { success: false, error: 'Could not save the change.' };
  };

  /**
   * Move a change to a new stage.
   *
   * Every gate goes through the authority: approvals signed before
   * implementation, pre-implementation actions closed before the change
   * goes in, remaining actions closed before it closes, and a temporary
   * change never implemented without an expiry date.
   *
   * The old app's stage button toasted "Moving to next stage..." and
   * moved nothing, so none of this was ever asked.
   */
  const advance = async (moc, to, { rejectionReason } = {}) => {
    const verdict = canAdvance(moc, to, {
      approvals: approvalsFor(moc.id),
      actions: actionsFor(moc.id),
    });
    if (!verdict.ok) return { success: false, error: verdict.reason };

    const patch = { ...moc, stage: to };
    if (to === 'Implementation') {
      patch.actual_implementation_date = new Date().toISOString();
      patch.implemented_by = user?.id || null;
    }
    if (to === 'Closed') {
      patch.closure_date = new Date().toISOString();
      patch.closed_by = user?.id || null;
    }
    if (to === 'Rejected') patch.rejection_reason = rejectionReason || null;

    const result = await updateMoc(moc.id, patch);
    if (result.success) {
      await logActivity(moc.id, `Stage changed to ${to}`,
        rejectionReason ? { reason: rejectionReason } : null);
      await fetchAll();
    }
    return result;
  };

  /**
   * AS13: a Closed, Rejected or Cancelled change is a record. Its gates,
   * decisions, actions and impacts are what it finished on, so the page
   * hides the controls and every write below refuses as well.
   */
  const lockedMoc = (mocId) => mocLockReason(records.find((m) => m.id === mocId));

  /**
   * AS13: add or correct the expiry date of a temporary or emergency
   * change while it is in Draft.
   *
   * A draft saved without one could not leave Draft at all, Cancelled
   * included, because the database refuses a temporary change past Draft
   * with no expiry, and there was no way to add the date afterwards. The
   * record could only be deleted. Past Draft the date is part of what was
   * approved, and this refuses.
   */
  const setExpiry = async (moc, expiryDate) => {
    const problem = validateExpiryEdit(moc, expiryDate);
    if (problem) return { success: false, error: problem };
    const result = await updateMoc(moc.id, { ...moc, expiry_date: expiryDate });
    if (result.success) {
      await logActivity(moc.id, moc.expiry_date
        ? `Expiry date changed from ${moc.expiry_date} to ${expiryDate}`
        : `Expiry date set to ${expiryDate}`);
      await fetchAll();
    }
    return result;
  };

  /** Assign an approver to a gate. */
  const addApprover = async (mocId, { approver_id, role, level }) => {
    const locked = lockedMoc(mocId);
    if (locked) return { success: false, error: locked };
    const { row } = buildApprovalWrite({
      moc_id: mocId, approver_id, role, level: level || 1, status: 'Pending',
    });
    const { error: err } = await supabase.from('moc_approvals').insert([row]);
    if (err) {
      if (err.code === UNIQUE_VIOLATION) {
        return { success: false, error: 'That person is already an approver at that level.' };
      }
      return { success: false, error: err.message };
    }
    await logActivity(mocId, `Approver added at level ${level || 1}`);
    await fetchAll();
    return { success: true };
  };

  /** Record an approval decision. */
  const decideApproval = async (approval, status, comments) => {
    const locked = lockedMoc(approval.moc_id);
    if (locked) return { success: false, error: locked };
    if (status === 'Rejected' && !String(comments || '').trim()) {
      return { success: false, error: 'A rejection needs a reason, so the originator knows what to change.' };
    }
    const { error: err } = await supabase
      .from('moc_approvals')
      .update({
        status,
        comments: comments || null,
        decision_date: new Date().toISOString(),
      })
      .eq('id', approval.id);
    if (err) return { success: false, error: err.message };
    await logActivity(approval.moc_id, `Approval ${status.toLowerCase()} at level ${approval.level ?? 1}`);
    await fetchAll();
    return { success: true };
  };

  // AS13: actions and impacts now write to moc_activity_log like stage
  // moves and approvals do. The dashboard promised that actions appear
  // in Recent activity, and nothing ever put them there.
  const addActions = async (mocId, rows, { skipRefresh = false } = {}) => {
    const locked = lockedMoc(mocId);
    if (locked) return { success: false, error: locked };
    const payload = rows
      .filter((a) => String(a.description || '').trim())
      .map((a) => buildActionWrite({ ...a, moc_id: mocId, status: a.status || 'Open' }).row);
    if (!payload.length) return { success: true };
    const { error: err } = await supabase.from('moc_actions').insert(payload);
    if (err) return { success: false, error: `The actions were not saved: ${err.message}` };
    await Promise.all(payload.map((a) => logActivity(mocId,
      `${a.action_type || 'Action'} action added: ${a.description}`)));
    if (!skipRefresh) await fetchAll();
    return { success: true };
  };

  const updateAction = async (id, patch) => {
    const existing = actions.find((a) => a.id === id);
    const mocId = existing?.moc_id || patch.moc_id;
    const locked = lockedMoc(mocId);
    if (locked) return { success: false, error: locked };
    const { row } = buildActionWrite(patch);
    if (patch.status === 'Complete' && !row.completed_at) {
      row.completed_at = new Date().toISOString();
    }
    const { error: err } = await supabase.from('moc_actions').update(row).eq('id', id);
    if (err) return { success: false, error: err.message };
    if (mocId) {
      const what = existing?.description || patch.description || 'an action';
      await logActivity(mocId, patch.status
        ? `Action marked ${String(patch.status).toLowerCase()}: ${what}`
        : `Action updated: ${what}`);
    }
    await fetchAll();
    return { success: true };
  };

  const addImpacts = async (mocId, rows, { skipRefresh = false } = {}) => {
    const locked = lockedMoc(mocId);
    if (locked) return { success: false, error: locked };
    const payload = rows
      .filter((i) => String(i.impact_area || '').trim())
      .map((i) => buildImpactWrite({ ...i, moc_id: mocId }).row);
    if (!payload.length) return { success: true };
    const { error: err } = await supabase.from('moc_impacts').insert(payload);
    if (err) return { success: false, error: `The impact assessment was not saved: ${err.message}` };
    await logActivity(mocId, `Impact assessment recorded: ${payload.map((i) => i.impact_area).join(', ')}`);
    if (!skipRefresh) await fetchAll();
    return { success: true };
  };

  // AS13: only a draft can be deleted. Past Draft a change has been seen
  // by somebody, and Cancel or Reject is how it ends with its record kept.
  const deleteMoc = async (id) => {
    const moc = records.find((m) => m.id === id);
    if (moc && moc.stage !== 'Draft') {
      return {
        success: false,
        error: `Only a draft can be deleted. ${moc.moc_code} is ${String(moc.stage).toLowerCase()}, so its record stays. A change that should not go ahead is cancelled or rejected instead.`,
      };
    }
    const { error: err } = await supabase.from('moc_records').delete().eq('id', id);
    if (err) return { success: false, error: err.message };
    await fetchAll();
    return { success: true };
  };

  return {
    orgId,
    userId: user?.id || null,
    records: recordsWithChildren,
    approvals,
    actions,
    impacts,
    activity,
    loading,
    error,
    hasAs6Schema,
    refresh: fetchAll,
    approvalsFor,
    actionsFor,
    impactsFor,
    activityFor,
    createMoc,
    updateMoc,
    advance,
    setExpiry,
    addApprover,
    decideApproval,
    addActions,
    updateAction,
    addImpacts,
    deleteMoc,
  };
};

export default useManagementOfChange;
