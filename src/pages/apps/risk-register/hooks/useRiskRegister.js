import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  AS2_SCHEMA_MESSAGE,
  as2ValuesEntered,
  buildRiskWrite,
  nextCodeFromExisting,
  planLinkChanges,
  resolveRiskCodes,
} from '../utils/riskPayload';

/** PostgREST's code for "that column is not in my schema cache". */
const UNKNOWN_COLUMN = 'PGRST204';
/** Postgres: undefined function, i.e. next_risk_code is not deployed yet. */
const UNDEFINED_FUNCTION = '42883';
/** Postgres: unique violation. */
const UNIQUE_VIOLATION = '23505';
/** Postgres: undefined column, what a select naming an absent column returns. */
const UNDEFINED_COLUMN = '42703';

const CODE_RETRIES = 3;

export const useRiskRegister = () => {
  const [risks, setRisks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  /**
   * Whether migration 20260916110000 is applied. The app works without
   * it, on fewer columns, and says so, as AS3 and AS4 do. Before AS13 it
   * dropped the residual, target and review date fields without a word
   * and reported the save as a success.
   */
  const [hasAs2Schema, setHasAs2Schema] = useState(true);
  const { organization, user } = useAuth();

  const fetchRisks = useCallback(async () => {
    if (!organization?.id) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('risk_register')
        .select('*')
        .eq('org_id', organization.id)
        .order('created_at', { ascending: false });

      if (err) throw err;
      const rows = data || [];
      if (rows.length) {
        setHasAs2Schema('target_score' in rows[0]);
      } else {
        // An empty register cannot show us its columns, so ask for one.
        const probe = await supabase.from('risk_register').select('target_score').limit(1);
        setHasAs2Schema(!(probe.error
          && (probe.error.code === UNDEFINED_COLUMN || probe.error.code === UNKNOWN_COLUMN)));
      }
      setRisks(rows);
    } catch (err) {
      // AS2: this used to console.error and leave `risks` at [], so a
      // failed query and an empty register looked identical on screen.
      // An empty register is empty. A broken one says so.
      setError(err.message || 'Could not load the risk register.');
      setRisks([]);
    } finally {
      setLoading(false);
    }
  }, [organization?.id]);

  useEffect(() => {
    fetchRisks();
  }, [fetchRisks]);

  /**
   * The next risk code for this organization. next_risk_code() issues it
   * under an advisory lock so two people creating a risk at the same
   * moment cannot collide. While migration 20260916110000 is unapplied
   * the function is absent, and we fall back to the highest code we can
   * see; the caller retries on a unique violation.
   */
  const issueRiskCode = async (attempt) => {
    const { data, error: err } = await supabase.rpc('next_risk_code', { p_org: organization.id });
    if (!err && data) return data;
    if (err && err.code !== UNDEFINED_FUNCTION) throw err;
    const fallback = nextCodeFromExisting(risks);
    if (attempt === 0) return fallback;
    // Space out retries so a second writer does not land on the same one.
    const m = /^RSK-(\d+)$/.exec(fallback);
    return `RSK-${String(Number(m[1]) + attempt).padStart(4, '0')}`;
  };

  const writeChildren = async (riskId, tags, linkedCodes, register, { replace = false } = {}) => {
    const warnings = [];

    // On an edit the form hands back the whole tag set, so it replaces
    // rather than appends. Appending would grow a duplicate row in
    // risk_tags on every save.
    if (replace) {
      const { error: delErr } = await supabase.from('risk_tags').delete().eq('risk_id', riskId);
      if (delErr) warnings.push(`The old tags could not be cleared: ${delErr.message}`);
    }

    if (tags.length) {
      const { error: err } = await supabase
        .from('risk_tags')
        .insert(tags.map((tag) => ({ risk_id: riskId, tag })));
      if (err) warnings.push(`Tags were not saved: ${err.message}`);
    }

    const { resolved, unresolved } = resolveRiskCodes(linkedCodes, register);
    if (unresolved.length) {
      warnings.push(`No risk in this register matches ${unresolved.join(', ')}.`);
    }

    // Links are kept in whichever direction they were stored. The edit
    // page lists both directions, so the save must compare against both,
    // or it turns every incoming link into a duplicate outgoing one.
    let existing = [];
    if (replace) {
      const { data, error: err } = await supabase
        .from('risk_links')
        .select('id, source_risk_id, target_risk_id')
        .or(`source_risk_id.eq.${riskId},target_risk_id.eq.${riskId}`);
      if (err) {
        warnings.push(`Links were not updated: ${err.message}`);
        return warnings;
      }
      existing = data || [];
    }
    const { toDelete, toInsert } = planLinkChanges(riskId, existing, resolved.map((r) => r.id));

    if (toDelete.length) {
      const { error: err } = await supabase.from('risk_links').delete().in('id', toDelete);
      if (err) warnings.push(`Removed links were not deleted: ${err.message}`);
    }
    if (toInsert.length) {
      const { error: err } = await supabase
        .from('risk_links')
        .insert(toInsert.map((targetId) => ({
          source_risk_id: riskId,
          target_risk_id: targetId,
          link_type: 'related',
        })));
      if (err) warnings.push(`Links were not saved: ${err.message}`);
    }

    return warnings;
  };

  /**
   * Create a risk. The form collects tags and linked risks, neither of
   * which is a column on risk_register; before AS2 the whole form object
   * went into the insert and PostgREST rejected every create. They go to
   * risk_tags and risk_links now.
   */
  const addRisk = async (formData) => {
    if (!organization?.id) {
      return { success: false, error: 'No organization is selected.' };
    }

    let hasAs2Columns = hasAs2Schema;
    // Two different retries, counted separately. Dropping the AS2
    // columns because the migration is unapplied must not also burn a
    // risk code, and a code collision must not re-send the columns we
    // just learned are absent.
    let codeAttempt = 0;

    for (let guard = 0; guard < CODE_RETRIES + 1; guard += 1) {
      const { row, tags, linkedCodes } = buildRiskWrite(formData, { hasAs2Columns });
      let code;
      try {
        code = await issueRiskCode(codeAttempt);
      } catch (err) {
        return { success: false, error: err.message };
      }

      const { data, error: err } = await supabase
        .from('risk_register')
        .insert([{ ...row, org_id: organization.id, created_by: user?.id, risk_id: code }])
        .select()
        .single();

      if (!err) {
        const warnings = await writeChildren(data.id, tags, linkedCodes, [...risks, data]);
        if (!hasAs2Columns && as2ValuesEntered(formData).length) warnings.unshift(AS2_SCHEMA_MESSAGE);
        setRisks((prev) => [data, ...prev]);
        return { success: true, data, warnings };
      }

      // The AS2 columns are not applied yet: drop them and try again, and
      // tell the user what was not saved.
      if (err.code === UNKNOWN_COLUMN && hasAs2Columns) {
        hasAs2Columns = false;
        setHasAs2Schema(false);
        continue;
      }
      // Someone else took that code between our read and our write.
      if (err.code === UNIQUE_VIOLATION && codeAttempt < CODE_RETRIES - 1) {
        codeAttempt += 1;
        continue;
      }

      return { success: false, error: err.message };
    }

    return {
      success: false,
      error: 'Could not allocate a risk code. Try again in a moment.',
    };
  };

  const updateRisk = async (id, updates) => {
    const existing = risks.find((r) => r.id === id) || {};
    let hasAs2Columns = hasAs2Schema;

    // Children come from the PATCH, not the merged risk: an update that
    // says nothing about tags must leave the tags alone.
    const touchesChildren = updates.tags !== undefined || updates.linked_risks !== undefined;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      // The row itself derives from the MERGED risk, because changing
      // only the likelihood still has to move the rating.
      const { row } = buildRiskWrite({ ...existing, ...updates }, { hasAs2Columns });
      const { tags, linkedCodes } = buildRiskWrite(updates, { hasAs2Columns });
      const { data, error: err } = await supabase
        .from('risk_register')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (!err) {
        const warnings = touchesChildren
          ? await writeChildren(id, tags, linkedCodes, risks, { replace: true })
          : [];
        if (!hasAs2Columns && as2ValuesEntered(updates).length) warnings.unshift(AS2_SCHEMA_MESSAGE);
        setRisks((prev) => prev.map((r) => (r.id === id ? data : r)));
        return { success: true, data, warnings };
      }
      if (err.code === UNKNOWN_COLUMN && hasAs2Columns) {
        hasAs2Columns = false;
        setHasAs2Schema(false);
        continue;
      }
      return { success: false, error: err.message };
    }
    return { success: false, error: 'Could not save the risk.' };
  };

  const deleteRisk = async (id) => {
    const { error: err } = await supabase.from('risk_register').delete().eq('id', id);
    if (err) return { success: false, error: err.message };
    setRisks((prev) => prev.filter((r) => r.id !== id));
    return { success: true };
  };

  return {
    risks, loading, error, hasAs2Schema, addRisk, updateRisk, deleteRisk, refresh: fetchRisks,
  };
};
