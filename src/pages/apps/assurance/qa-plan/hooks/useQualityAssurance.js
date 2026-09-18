import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { canCloseNcr, canDecideCheckpoint, canAdvancePlan } from '@/lib/qualityAssurance';
import {
  buildCapaWrite,
  buildCheckpointWrite,
  buildNcrWrite,
  buildPlanWrite,
  ncrLockReason,
  ncrStatusFromActions,
  nextNcrCodeFromExisting,
  nextPlanCodeFromExisting,
  planLockReason,
  withDecisionDefaults,
} from '../utils/qaPayload';

const UNKNOWN_COLUMN = 'PGRST204';
const UNKNOWN_RELATION = 'PGRST200';
const UNDEFINED_TABLE = '42P01';
const UNDEFINED_FUNCTION = '42883';
const UNIQUE_VIOLATION = '23505';
/** Postgres: check constraint violated. */
const CHECK_VIOLATION = '23514';
/** Postgres: insufficient privilege — what the cross-tenant trigger raises. */
const INSUFFICIENT_PRIVILEGE = '42501';

const CODE_RETRIES = 3;

/**
 * AS7 — the one place this app reads and writes.
 *
 * There was nothing to replace. Quality Assurance Plan issued no
 * queries at all, because there was nothing to query: no qa_*, ncr* or
 * capa* table exists in the database. Every screen read from
 * src/data/qa-plan/. The dashboard's "Pending Checks" tile was the
 * literal 12. The register's progress bars were percentages somebody
 * typed. The detail page's ITP showed two checkpoints, both belonging
 * to a different plan than the one the URL asked for, because the page
 * read useParams().id while the route declared :qaPlanId — so the id
 * was always undefined and every row opened the same plan.
 *
 * `hasAs7Schema` is false while migration 20260917500000 is unapplied.
 * The app then says so, plainly, instead of showing invented plans.
 */
export const useQualityAssurance = () => {
  const { organization, user } = useAuth();
  const orgId = organization?.id || null;

  const [plans, setPlans] = useState([]);
  const [checkpoints, setCheckpoints] = useState([]);
  const [ncrs, setNcrs] = useState([]);
  const [capas, setCapas] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasAs7Schema, setHasAs7Schema] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const planRes = await supabase
        .from('qa_plans')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (planRes.error) {
        if (planRes.error.code === UNDEFINED_TABLE
            || planRes.error.code === UNKNOWN_RELATION) {
          // The whole module's schema is missing. Say so; do not invent
          // a register.
          setHasAs7Schema(false);
          setPlans([]); setCheckpoints([]); setNcrs([]); setCapas([]); setActivity([]);
          setLoading(false);
          return;
        }
        throw planRes.error;
      }

      const planRows = planRes.data || [];
      setHasAs7Schema(true);

      const ncrRes = await supabase
        .from('qa_ncrs')
        .select('*')
        .eq('org_id', orgId)
        .order('raised_date', { ascending: false });
      if (ncrRes.error) throw ncrRes.error;
      const ncrRows = ncrRes.data || [];

      let checkpointRows = [];
      if (planRows.length) {
        const res = await supabase
          .from('qa_checkpoints')
          .select('*')
          .in('plan_id', planRows.map((p) => p.id))
          .order('sequence', { ascending: true, nullsFirst: false });
        if (res.error) throw res.error;
        checkpointRows = res.data || [];
      }

      let capaRows = [];
      if (ncrRows.length) {
        const res = await supabase
          .from('qa_capas')
          .select('*')
          .in('ncr_id', ncrRows.map((n) => n.id))
          .order('due_date', { ascending: true, nullsFirst: false });
        if (res.error) throw res.error;
        capaRows = res.data || [];
      }

      const logRes = await supabase
        .from('qa_activity_log')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(300);
      if (logRes.error) throw logRes.error;

      setPlans(planRows);
      setCheckpoints(checkpointRows);
      setNcrs(ncrRows);
      setCapas(capaRows);
      setActivity(logRes.data || []);
    } catch (err) {
      // An organization with no quality plans has no quality plans. A
      // broken query says so.
      setError(err.message || 'Could not load the quality register.');
      setPlans([]); setCheckpoints([]); setNcrs([]); setCapas([]); setActivity([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const checkpointsFor = useCallback(
    (planId) => checkpoints.filter((c) => c.plan_id === planId), [checkpoints]);
  const ncrsForPlan = useCallback(
    (planId) => ncrs.filter((n) => n.plan_id === planId), [ncrs]);
  const capasFor = useCallback(
    (ncrId) => capas.filter((c) => c.ncr_id === ncrId), [capas]);
  const activityFor = useCallback(
    (entityId) => activity.filter(
      (a) => a.entity_id === entityId || a.plan_id === entityId || a.ncr_id === entityId),
    [activity]);

  const plansWithChildren = useMemo(
    () => plans.map((p) => ({
      ...p,
      checkpoints: checkpointsFor(p.id),
      ncrs: ncrsForPlan(p.id),
    })),
    [plans, checkpointsFor, ncrsForPlan],
  );

  const ncrsWithChildren = useMemo(
    () => ncrs.map((n) => ({ ...n, capas: capasFor(n.id) })),
    [ncrs, capasFor],
  );

  const logActivity = async (entityType, entityId, action, details, keys = {}) => {
    // Best effort: a logging failure must never make a real write
    // report as failed.
    if (!orgId) return;
    await supabase.from('qa_activity_log').insert([{
      org_id: orgId,
      entity_type: entityType,
      entity_id: entityId,
      plan_id: keys.plan_id || null,
      ncr_id: keys.ncr_id || null,
      actor_id: user?.id || null,
      action,
      details: details || null,
    }]);
  };

  /**
   * A check-constraint failure means the database refused something the
   * form should have caught first. Naming it beats showing a
   * constraint name.
   */
  const explainWriteError = (err) => {
    if (err.code === INSUFFICIENT_PRIVILEGE) {
      return err.message || 'That record belongs to another organization.';
    }
    if (err.code !== CHECK_VIOLATION) return err.message;
    if (/decision_needs_record/.test(err.message)) {
      return 'A checkpoint marked passed, failed or waived needs the date it was decided '
        + 'and who decided it. A hold point that passed with nobody named did not pass.';
    }
    if (/waiver_needs_reason/.test(err.message)) {
      return 'Say why the point is being waived. A waiver is a deliberate acceptance of '
        + 'less assurance, and the reason is what makes it auditable afterwards.';
    }
    if (/closure_needs_record/.test(err.message)) {
      return 'Closing a non-conformance needs the disposition, the date and the closer, '
        + 'and a critical or major one needs the root cause as well.';
    }
    if (/disposition_needs_date/.test(err.message)) {
      return 'Record the date the disposition was agreed.';
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
    if (/_status_check|_severity_check|_disposition_check|_point_type_check|_responsible_check|_action_type_check|_root_cause_category_check/
      .test(err.message)) {
      return 'One of the values on this record is not one the register accepts.';
    }
    return err.message;
  };

  const issueCode = async (kind, attempt) => {
    const year = new Date().getFullYear();
    const fn = kind === 'plan' ? 'next_qa_plan_code' : 'next_ncr_code';
    const { data, error: err } = await supabase.rpc(fn, { p_org: orgId, p_year: year });
    if (!err && data) return data;
    if (err && err.code !== UNDEFINED_FUNCTION) throw err;
    const fallback = kind === 'plan'
      ? nextPlanCodeFromExisting(plans, year)
      : nextNcrCodeFromExisting(ncrs, year);
    if (attempt === 0) return fallback;
    const m = /^([A-Z]+)-(\d+)-(\d+)$/.exec(fallback);
    return `${m[1]}-${m[2]}-${String(Number(m[3]) + attempt).padStart(3, '0')}`;
  };

  /* ---------------------------------------------------------------- */
  /* Quality plans                                                    */
  /* ---------------------------------------------------------------- */

  const createPlan = async (form, { checkpoints: checkpointRows = [] } = {}) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };

    for (let attempt = 0; attempt < CODE_RETRIES; attempt += 1) {
      let code;
      try {
        code = await issueCode('plan', attempt);
      } catch (err) {
        return { success: false, error: explainWriteError(err) };
      }

      const { row } = buildPlanWrite(form);
      const { data, error: err } = await supabase
        .from('qa_plans')
        .insert([{
          ...row,
          org_id: orgId,
          plan_code: code,
          created_by: user?.id || null,
          status: row.status || 'Draft',
        }])
        .select()
        .single();

      if (err) {
        if (err.code === UNIQUE_VIOLATION && attempt < CODE_RETRIES - 1) continue;
        return { success: false, error: explainWriteError(err) };
      }

      const warnings = [];
      if (checkpointRows.length) {
        const r = await addCheckpoints(data.id, checkpointRows, { skipRefresh: true });
        if (!r.success) warnings.push(r.error);
      }

      await logActivity('plan', data.id, 'Quality plan created',
        { plan_code: code }, { plan_id: data.id });
      await fetchAll();
      return { success: true, data, warning: warnings.join(' ') || null };
    }
    return { success: false, error: 'Could not allocate a plan number. Try again in a moment.' };
  };

  const updatePlan = async (id, form) => {
    const { row } = buildPlanWrite(form);
    const { data, error: err } = await supabase
      .from('qa_plans')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true, data };
  };

  /**
   * Move a plan to a new status, through the gate.
   *
   * canAdvancePlan refuses a jump the workflow does not allow, and for
   * Closed it refuses over an outstanding hold point, a failed
   * checkpoint of any type, or an open non-conformance raised against
   * the plan.
   */
  const advancePlan = async (plan, to) => {
    const verdict = canAdvancePlan(plan, to, {
      checkpoints: checkpointsFor(plan.id),
      ncrs: ncrsForPlan(plan.id),
    });
    if (!verdict.ok) return { success: false, error: verdict.reason };

    const patch = { ...plan, status: to };
    const result = await updatePlan(plan.id, patch);
    if (result.success) {
      await logActivity('plan', plan.id, `Plan status changed to ${to}`,
        null, { plan_id: plan.id });
      await fetchAll();
    }
    return result;
  };

  const deletePlan = async (id) => {
    const { error: err } = await supabase.from('qa_plans').delete().eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true };
  };

  /* ---------------------------------------------------------------- */
  /* Checkpoints — the inspection and test plan                       */
  /* ---------------------------------------------------------------- */

  /**
   * AS13: a closed, superseded or cancelled plan is a record. The page
   * hides the controls; this refuses the write whatever calls it.
   */
  const lockedPlanFor = (planId) => planLockReason(plans.find((p) => p.id === planId));
  const lockedCheckpoint = (id) => {
    const checkpoint = checkpoints.find((c) => c.id === id);
    return checkpoint ? lockedPlanFor(checkpoint.plan_id) : null;
  };

  const addCheckpoints = async (planId, rows, { skipRefresh = false } = {}) => {
    const locked = lockedPlanFor(planId);
    if (locked) return { success: false, error: locked };
    const payload = rows
      .filter((c) => String(c.title || '').trim() && String(c.item_no || '').trim())
      .map((c, i) => buildCheckpointWrite({
        ...c,
        plan_id: planId,
        sequence: c.sequence ?? i + 1,
        status: c.status || 'Pending',
      }).row);
    if (!payload.length) return { success: true };
    const { error: err } = await supabase.from('qa_checkpoints').insert(payload);
    if (err) {
      if (err.code === UNIQUE_VIOLATION) {
        return {
          success: false,
          error: 'An item number is used twice in this plan. Each ITP item needs its own number.',
        };
      }
      return { success: false, error: `The inspection points were not saved: ${explainWriteError(err)}` };
    }
    if (!skipRefresh) await fetchAll();
    return { success: true };
  };

  const updateCheckpoint = async (id, patch) => {
    const locked = lockedCheckpoint(id);
    if (locked) return { success: false, error: locked };
    const { row } = buildCheckpointWrite(patch);
    const { error: err } = await supabase.from('qa_checkpoints').update(row).eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true };
  };

  /**
   * Record a checkpoint decision.
   *
   * The gate runs before the write so the user is told which field is
   * missing rather than shown a constraint name. The constraint is
   * still there: it is what stops a decision being recorded by any
   * other route.
   *
   * AS13: the defaults (today's date, and the current user when no
   * verifier is named) are applied BEFORE the gate. They used to be
   * applied after it, so the gate judged a row with no verifier and
   * "Verifier, if not you" could not actually be left blank.
   */
  const decideCheckpoint = async (checkpoint, status, patch = {}) => {
    const locked = planLockReason(plans.find((p) => p.id === checkpoint.plan_id));
    if (locked) return { success: false, error: locked };

    const filled = withDecisionDefaults(patch, status, user?.id || null, new Date(), checkpoint);
    const verdict = canDecideCheckpoint(checkpoint, status, filled);
    if (!verdict.ok) return { success: false, error: verdict.reason };

    const row = {
      ...filled,
      status,
      updated_at: new Date().toISOString(),
    };

    const result = await updateCheckpoint(checkpoint.id, row);
    if (result.success) {
      await logActivity('checkpoint', checkpoint.id,
        `${checkpoint.point_type || 'Checkpoint'} ${checkpoint.item_no || ''} marked ${status}`.trim(),
        patch.remarks ? { remarks: patch.remarks } : null,
        { plan_id: checkpoint.plan_id });
      await fetchAll();
    }
    return result;
  };

  const deleteCheckpoint = async (id) => {
    const locked = lockedCheckpoint(id);
    if (locked) return { success: false, error: locked };
    const { error: err } = await supabase.from('qa_checkpoints').delete().eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true };
  };

  /* ---------------------------------------------------------------- */
  /* Non-conformance reports                                          */
  /* ---------------------------------------------------------------- */

  const createNcr = async (form, { capas: capaRows = [] } = {}) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };

    for (let attempt = 0; attempt < CODE_RETRIES; attempt += 1) {
      let code;
      try {
        code = await issueCode('ncr', attempt);
      } catch (err) {
        return { success: false, error: explainWriteError(err) };
      }

      const { row } = buildNcrWrite(form);
      const { data, error: err } = await supabase
        .from('qa_ncrs')
        .insert([{
          ...row,
          org_id: orgId,
          ncr_code: code,
          raised_by: row.raised_by || user?.id || null,
          raised_date: row.raised_date || new Date().toISOString().slice(0, 10),
          status: row.status || 'Open',
        }])
        .select()
        .single();

      if (err) {
        if (err.code === UNIQUE_VIOLATION && attempt < CODE_RETRIES - 1) continue;
        return { success: false, error: explainWriteError(err) };
      }

      const warnings = [];
      if (capaRows.length) {
        const r = await addCapas(data.id, capaRows, { skipRefresh: true });
        if (!r.success) warnings.push(r.error);
      }

      await logActivity('ncr', data.id, 'Non-conformance raised',
        { ncr_code: code, severity: data.severity },
        { ncr_id: data.id, plan_id: data.plan_id });
      await fetchAll();
      return { success: true, data, warning: warnings.join(' ') || null };
    }
    return { success: false, error: 'Could not allocate an NCR number. Try again in a moment.' };
  };

  const updateNcr = async (id, form) => {
    const { row } = buildNcrWrite(form);
    const { data, error: err } = await supabase
      .from('qa_ncrs')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true, data };
  };

  /** Agree the disposition: what happens to the non-conforming item. */
  const setDisposition = async (ncr, { disposition, disposition_rationale }) => {
    if (!disposition) {
      return { success: false, error: 'Pick a disposition.' };
    }
    const result = await updateNcr(ncr.id, {
      ...ncr,
      disposition,
      disposition_rationale: disposition_rationale || null,
      disposition_date: new Date().toISOString().slice(0, 10),
      disposition_approved_by: user?.id || null,
      // Agreeing the disposition hands the status to the actions: with
      // open ones it reads Actions in progress, with every one finished
      // it reads Verification.
      status: ncrStatusFromActions(
        {
          ...ncr,
          status: ncr.status === 'Open' || ncr.status === 'Under investigation'
            ? 'Disposition agreed' : ncr.status,
        },
        capasFor(ncr.id),
      ),
    });
    if (result.success) {
      await logActivity('ncr', ncr.id, `Disposition agreed: ${disposition}`,
        disposition_rationale ? { rationale: disposition_rationale } : null,
        { ncr_id: ncr.id, plan_id: ncr.plan_id });
      await fetchAll();
    }
    return result;
  };

  /**
   * Close a non-conformance, through the gate.
   *
   * canCloseNcr refuses a critical or major one until a corrective
   * action has been verified effective. A completed corrective action
   * is not a working corrective action.
   */
  const closeNcr = async (ncr, { closure_notes } = {}) => {
    const verdict = canCloseNcr(ncr, capasFor(ncr.id));
    if (!verdict.ok) return { success: false, error: verdict.reason };

    const result = await updateNcr(ncr.id, {
      ...ncr,
      status: 'Closed',
      closed_date: new Date().toISOString().slice(0, 10),
      closed_by: user?.id || null,
      closure_notes: closure_notes || ncr.closure_notes || null,
    });
    if (result.success) {
      await logActivity('ncr', ncr.id, 'Non-conformance closed', null,
        { ncr_id: ncr.id, plan_id: ncr.plan_id });
      await fetchAll();
    }
    return result;
  };

  /** Void one raised in error. The honest alternative to closing it. */
  const voidNcr = async (ncr, reason) => {
    if (!String(reason || '').trim()) {
      return { success: false, error: 'Say why this was raised in error.' };
    }
    const result = await updateNcr(ncr.id, {
      ...ncr,
      status: 'Voided',
      closure_notes: reason,
    });
    if (result.success) {
      await logActivity('ncr', ncr.id, 'Non-conformance voided', { reason },
        { ncr_id: ncr.id, plan_id: ncr.plan_id });
      await fetchAll();
    }
    return result;
  };

  const deleteNcr = async (id) => {
    const { error: err } = await supabase.from('qa_ncrs').delete().eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true };
  };

  /* ---------------------------------------------------------------- */
  /* Corrective and preventive actions                                */
  /* ---------------------------------------------------------------- */

  const lockedNcr = (ncrId) => ncrLockReason(ncrs.find((n) => n.id === ncrId));

  /**
   * AS13: keep the non-conformance's status in step with its actions
   * once its disposition is agreed (ncrStatusFromActions). Returns a
   * warning when the action was saved and the status was not, so the
   * page can say so rather than let the two disagree silently.
   */
  const syncNcrStatus = async (ncrId, nextCapas) => {
    const ncr = ncrs.find((n) => n.id === ncrId);
    if (!ncr) return null;
    const to = ncrStatusFromActions(ncr, nextCapas);
    if (to === ncr.status) return null;
    const { error: err } = await supabase
      .from('qa_ncrs')
      .update({ status: to, updated_at: new Date().toISOString() })
      .eq('id', ncrId);
    if (err) {
      return `The action was saved, but ${ncr.ncr_code} could not be moved to ${to}: `
        + `${explainWriteError(err)}`;
    }
    await logActivity('ncr', ncrId, `Status changed to ${to}`, null,
      { ncr_id: ncrId, plan_id: ncr.plan_id });
    return null;
  };

  const addCapas = async (ncrId, rows, { skipRefresh = false } = {}) => {
    const locked = lockedNcr(ncrId);
    if (locked) return { success: false, error: locked };
    const payload = rows
      .filter((c) => String(c.description || '').trim())
      .map((c) => buildCapaWrite({
        ...c,
        ncr_id: ncrId,
        action_type: c.action_type || 'Corrective',
        status: c.status || 'Open',
      }).row);
    if (!payload.length) return { success: true };
    const { error: err } = await supabase.from('qa_capas').insert(payload);
    if (err) {
      return { success: false, error: `The actions were not saved: ${explainWriteError(err)}` };
    }
    const warning = await syncNcrStatus(ncrId, [...capasFor(ncrId), ...payload]);
    if (!skipRefresh) await fetchAll();
    return { success: true, warning };
  };

  const updateCapa = async (id, patch) => {
    const existing = capas.find((c) => c.id === id);
    const ncrId = existing?.ncr_id || patch.ncr_id;
    const locked = lockedNcr(ncrId);
    if (locked) return { success: false, error: locked };
    const { row } = buildCapaWrite(patch);
    if (patch.status === 'Complete' && !row.completed_at) {
      row.completed_at = new Date().toISOString();
    }
    const { error: err } = await supabase.from('qa_capas').update(row).eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    const warning = await syncNcrStatus(ncrId,
      capasFor(ncrId).map((c) => (c.id === id ? { ...c, ...row } : c)));
    await fetchAll();
    return { success: true, warning };
  };

  /**
   * Record the effectiveness check.
   *
   * `verified` is a three-state answer and all three are meaningful:
   * true (it worked), false (it did not, go round again), and never
   * asked. The date and the checker are written here rather than left
   * to the form, because the database refuses the row without them.
   */
  const recordEffectiveness = async (capa, verified, notes) => {
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
    const result = await updateCapa(capa.id, {
      effectiveness_verified: verified,
      effectiveness_checked_at: new Date().toISOString().slice(0, 10),
      effectiveness_verified_by: user?.id || null,
      effectiveness_notes: notes || null,
    });
    if (result.success) {
      await logActivity('capa', capa.id,
        verified ? 'Action verified effective' : 'Action found NOT effective',
        notes ? { notes } : null, { ncr_id: capa.ncr_id });
      await fetchAll();
    }
    return result;
  };

  const deleteCapa = async (id) => {
    const ncrId = capas.find((c) => c.id === id)?.ncr_id;
    const locked = lockedNcr(ncrId);
    if (locked) return { success: false, error: locked };
    const { error: err } = await supabase.from('qa_capas').delete().eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    const warning = ncrId
      ? await syncNcrStatus(ncrId, capasFor(ncrId).filter((c) => c.id !== id))
      : null;
    await fetchAll();
    return { success: true, warning };
  };

  return {
    orgId,
    userId: user?.id || null,
    plans: plansWithChildren,
    rawPlans: plans,
    checkpoints,
    ncrs: ncrsWithChildren,
    capas,
    activity,
    loading,
    error,
    hasAs7Schema,
    refresh: fetchAll,
    checkpointsFor,
    ncrsForPlan,
    capasFor,
    activityFor,
    createPlan,
    updatePlan,
    advancePlan,
    deletePlan,
    addCheckpoints,
    updateCheckpoint,
    decideCheckpoint,
    deleteCheckpoint,
    createNcr,
    updateNcr,
    setDisposition,
    closeNcr,
    voidNcr,
    deleteNcr,
    addCapas,
    updateCapa,
    recordEffectiveness,
    deleteCapa,
  };
};

export default useQualityAssurance;
