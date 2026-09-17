import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { rollForward, toDateOnlyString } from '@/lib/complianceStatus';
import {
  buildAuthorityWrite,
  buildObligationWrite,
  nextCodeFromExisting,
} from '../utils/obligationPayload';

/** PostgREST's code for "that column is not in my schema cache". */
const UNKNOWN_COLUMN = 'PGRST204';
/** PostgREST: that relationship or table is not in my schema cache. */
const UNKNOWN_RELATION = 'PGRST200';
/** Postgres: undefined table. */
const UNDEFINED_TABLE = '42P01';
/** Postgres: undefined function, i.e. next_obligation_code is not deployed. */
const UNDEFINED_FUNCTION = '42883';
/** Postgres: unique violation. */
const UNIQUE_VIOLATION = '23505';

const CODE_RETRIES = 3;

/**
 * AS3 — the one place this app reads and writes.
 *
 * It replaces three services and, more importantly, replaces the way
 * they decided WHOSE data to show. `compliancePermissionsService`
 * queried organization_members directly, took the first active row by
 * joined_at, and used that organization's id. That is a second
 * membership authority sitting beside the Suite's own
 * (membership-consolidation: organization_members is THE membership
 * table, read through the auth context), and for anyone who belongs to
 * more than one organization it would quietly pick a different one from
 * the rest of the Suite: the app switcher would say one org and the
 * compliance register would show another's obligations. The org comes
 * from the auth context now, as it does in every other app.
 *
 * Three states, kept distinct, because the old app collapsed them:
 *   loading      — we do not know yet
 *   error        — the query failed, and the user is told so
 *   empty        — this organization has no obligations
 * The old Register set records to [] on a failed fetch and rendered
 * "No obligations found matching your criteria", so a broken database
 * and a clean register looked identical.
 */
export const useRegulatoryCompliance = () => {
  const { organization, user } = useAuth();
  const orgId = organization?.id || null;

  const [obligations, setObligations] = useState([]);
  const [authorities, setAuthorities] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  /**
   * Whether migration 20260917100000 has been applied. Production
   * applies are owner-run and held, so the app ships able to work
   * against both shapes and finds out which one it has by asking.
   */
  const [hasAs3Schema, setHasAs3Schema] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      // The authority is joined; the owner is NOT. The old service
      // joined `users!regulatory_obligations_owner_id_fkey(email,
      // raw_user_meta_data)`, which selects from auth.users through a
      // named foreign key. Owners are resolved from the organization's
      // own member list instead, where the app already has the names.
      let rows = null;
      let as3 = true;
      let res = await supabase
        .from('regulatory_obligations')
        .select('*, authority:regulatory_authorities(id, name, acronym)')
        .eq('org_id', orgId)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (res.error && (res.error.code === UNKNOWN_RELATION || res.error.code === UNKNOWN_COLUMN)) {
        // No embedded authority available on this schema; read flat.
        res = await supabase
          .from('regulatory_obligations')
          .select('*')
          .eq('org_id', orgId);
      }
      if (res.error) throw res.error;
      rows = res.data || [];
      if (rows.length && !('lifecycle' in rows[0])) as3 = false;

      const authRes = await supabase
        .from('regulatory_authorities')
        .select('*')
        .eq('org_id', orgId)
        .order('name', { ascending: true });
      if (authRes.error) throw authRes.error;

      // The evidence table only exists once the migration is applied.
      // Its absence is not an error; it means no filing has a home yet.
      let evidenceRows = [];
      if (rows.length) {
        const ev = await supabase
          .from('regulatory_evidence')
          .select('*')
          .in('obligation_id', rows.map((r) => r.id))
          .order('submitted_date', { ascending: false });
        if (ev.error) {
          if (ev.error.code !== UNDEFINED_TABLE && ev.error.code !== UNKNOWN_RELATION) throw ev.error;
          as3 = false;
        } else {
          evidenceRows = ev.data || [];
        }
      }

      setObligations(rows);
      setAuthorities(authRes.data || []);
      setEvidence(evidenceRows);
      setHasAs3Schema(as3);
    } catch (err) {
      // An empty register is empty. A broken one says so.
      setError(err.message || 'Could not load the compliance register.');
      setObligations([]);
      setAuthorities([]);
      setEvidence([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /** Evidence for one obligation, newest first. */
  const evidenceFor = useCallback(
    (obligationId) => evidence.filter((e) => e.obligation_id === obligationId),
    [evidence],
  );

  const obligationsWithEvidence = useMemo(
    () => obligations.map((o) => ({ ...o, evidence: evidenceFor(o.id) })),
    [obligations, evidenceFor],
  );

  /**
   * The next obligation code for this organization.
   * next_obligation_code() issues it under an advisory lock so two
   * people filing at the same moment cannot collide. While the
   * migration is unapplied the function is absent and we fall back to
   * the highest code we can see; the caller retries on a unique
   * violation.
   */
  const issueCode = async (attempt) => {
    const { data, error: err } = await supabase.rpc('next_obligation_code', { p_org: orgId });
    if (!err && data) return data;
    if (err && err.code !== UNDEFINED_FUNCTION) throw err;
    const fallback = nextCodeFromExisting(obligations);
    if (attempt === 0) return fallback;
    const m = /^REG-(\d+)$/.exec(fallback);
    return `REG-${String(Number(m[1]) + attempt).padStart(4, '0')}`;
  };

  const createObligation = async (form) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };
    let as3 = hasAs3Schema;

    for (let attempt = 0; attempt < CODE_RETRIES; attempt += 1) {
      let code;
      try {
        code = await issueCode(attempt);
      } catch (err) {
        return { success: false, error: err.message };
      }

      const { row } = buildObligationWrite(form, { hasAs3Columns: as3 });
      const payload = { ...row, org_id: orgId, created_by: user?.id || null };
      if (as3) payload.obligation_code = code;

      const { data, error: err } = await supabase
        .from('regulatory_obligations')
        .insert([payload])
        .select()
        .single();

      if (!err) {
        await fetchAll();
        return { success: true, data };
      }
      if (err.code === UNKNOWN_COLUMN && as3) {
        as3 = false;
        setHasAs3Schema(false);
        continue;
      }
      // Someone else took that code between our read and our write.
      if (err.code === UNIQUE_VIOLATION && attempt < CODE_RETRIES - 1) continue;
      return { success: false, error: err.message };
    }
    return { success: false, error: 'Could not allocate an obligation code. Try again in a moment.' };
  };

  const updateObligation = async (id, form) => {
    let as3 = hasAs3Schema;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { row } = buildObligationWrite(form, { hasAs3Columns: as3 });
      const { data, error: err } = await supabase
        .from('regulatory_obligations')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (!err) {
        await fetchAll();
        return { success: true, data };
      }
      if (err.code === UNKNOWN_COLUMN && as3) {
        as3 = false;
        setHasAs3Schema(false);
        continue;
      }
      return { success: false, error: err.message };
    }
    return { success: false, error: 'Could not save the obligation.' };
  };

  const deleteObligation = async (id) => {
    const { error: err } = await supabase.from('regulatory_obligations').delete().eq('id', id);
    if (err) return { success: false, error: err.message };
    await fetchAll();
    return { success: true };
  };

  /**
   * Record a filing against an obligation.
   *
   * Two writes that belong together: the evidence row, and the parent's
   * last_submitted_date plus its next due date. The due date rolls
   * forward from the date that WAS due, not from the filing date, or a
   * return filed three weeks late walks the whole schedule later every
   * period.
   *
   * If the evidence table is not there yet the parent is still updated
   * and the caller is TOLD the filing itself was not stored. Writing
   * half of this silently is the fail-open shape this module is being
   * rebuilt to remove.
   */
  const recordSubmission = async (obligation, { submitted_date, reference, notes, period_label, file_url }) => {
    const submitted = toDateOnlyString(submitted_date) || toDateOnlyString(new Date());
    let warning = null;

    if (hasAs3Schema) {
      const { error: err } = await supabase.from('regulatory_evidence').insert([{
        obligation_id: obligation.id,
        submitted_date: submitted,
        submitted_by: user?.id || null,
        reference: reference || null,
        notes: notes || null,
        period_label: period_label || null,
        file_url: file_url || null,
      }]);
      if (err) {
        if (err.code === UNDEFINED_TABLE || err.code === UNKNOWN_RELATION) {
          warning = 'The filing record could not be stored: this database does not have the evidence table yet. The obligation dates were updated.';
        } else {
          return { success: false, error: err.message };
        }
      }
    } else {
      warning = 'The filing record could not be stored: this database does not have the evidence table yet. The obligation dates were updated.';
    }

    const nextDue = rollForward(obligation.due_date, obligation.frequency);
    const result = await updateObligation(obligation.id, {
      ...obligation,
      last_submitted_date: submitted,
      due_date: nextDue ? toDateOnlyString(nextDue) : obligation.due_date,
    });
    if (!result.success) return result;
    return { success: true, warning, nextDue: nextDue ? toDateOnlyString(nextDue) : null };
  };

  const createAuthority = async (form) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };
    let as3 = hasAs3Schema;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { row } = buildAuthorityWrite(form, { hasAs3Columns: as3 });
      const { data, error: err } = await supabase
        .from('regulatory_authorities')
        .insert([{ ...row, org_id: orgId, created_by: user?.id || null }])
        .select()
        .single();
      if (!err) {
        await fetchAll();
        return { success: true, data };
      }
      if (err.code === UNKNOWN_COLUMN && as3) {
        as3 = false;
        setHasAs3Schema(false);
        continue;
      }
      return { success: false, error: err.message };
    }
    return { success: false, error: 'Could not save the regulator.' };
  };

  const updateAuthority = async (id, form) => {
    let as3 = hasAs3Schema;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { row } = buildAuthorityWrite(form, { hasAs3Columns: as3 });
      const { data, error: err } = await supabase
        .from('regulatory_authorities')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (!err) {
        await fetchAll();
        return { success: true, data };
      }
      if (err.code === UNKNOWN_COLUMN && as3) {
        as3 = false;
        setHasAs3Schema(false);
        continue;
      }
      return { success: false, error: err.message };
    }
    return { success: false, error: 'Could not save the regulator.' };
  };

  /**
   * Deleting a regulator that obligations point at would leave those
   * obligations with a dangling authority, so the caller is told how
   * many there are and refuses rather than cascading.
   */
  const deleteAuthority = async (id) => {
    const inUse = obligations.filter((o) => o.authority_id === id);
    if (inUse.length) {
      return {
        success: false,
        error: `${inUse.length} obligation${inUse.length === 1 ? '' : 's'} still point${inUse.length === 1 ? 's' : ''} at this regulator. Reassign them first.`,
      };
    }
    const { error: err } = await supabase.from('regulatory_authorities').delete().eq('id', id);
    if (err) return { success: false, error: err.message };
    await fetchAll();
    return { success: true };
  };

  return {
    orgId,
    obligations: obligationsWithEvidence,
    authorities,
    evidence,
    loading,
    error,
    hasAs3Schema,
    refresh: fetchAll,
    evidenceFor,
    createObligation,
    updateObligation,
    deleteObligation,
    recordSubmission,
    createAuthority,
    updateAuthority,
    deleteAuthority,
  };
};

export default useRegulatoryCompliance;
