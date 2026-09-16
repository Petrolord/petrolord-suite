import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

/**
 * AS2 — risk register snapshots, actually saved.
 *
 * SnapshotManager toasted "Snapshot Saved: Current risk register state
 * has been captured" and wrote nothing at all, then listed one invented
 * snapshot, "Q2 2026 Summary, 42 Risks". A false confirmation of a write
 * is worse than a missing feature: the whole point of a snapshot is that
 * someone can go back to it at a board review.
 *
 * `risk_register_snapshots` existed the whole time, with org_id, name,
 * description and a jsonb payload.
 */
export const useRiskSnapshots = () => {
  const { organization, user } = useAuth();
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSnapshots = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('risk_register_snapshots')
        .select('id, name, description, created_at, snapshot_data')
        .eq('org_id', organization.id)
        .order('created_at', { ascending: false });
      if (err) throw err;
      setSnapshots(data || []);
    } catch (err) {
      setError(err.message || 'Could not load snapshots.');
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, [organization?.id]);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  const saveSnapshot = async (name, risks, description = '') => {
    if (!organization?.id) return { success: false, error: 'No organization is selected.' };
    if (!name?.trim()) return { success: false, error: 'Give the snapshot a name.' };

    const payload = {
      captured_at: new Date().toISOString(),
      risk_count: risks.length,
      risks: risks.map((r) => ({
        risk_id: r.risk_id,
        title: r.title,
        category: r.category,
        status: r.status,
        likelihood: r.likelihood,
        impact: r.impact,
        risk_score: r.risk_score,
        residual_likelihood: r.residual_likelihood ?? null,
        residual_impact: r.residual_impact ?? null,
        residual_score: r.residual_score ?? null,
        rating: r.rating,
        appetite_status: r.appetite_status ?? null,
        target_score: r.target_score ?? null,
        next_review_date: r.next_review_date ?? null,
        owner_id: r.owner_id ?? null,
      })),
    };

    const { data, error: err } = await supabase
      .from('risk_register_snapshots')
      .insert([{
        org_id: organization.id,
        name: name.trim(),
        description: description.trim() || null,
        snapshot_data: payload,
        created_by: user?.id,
      }])
      .select()
      .single();

    if (err) return { success: false, error: err.message };
    setSnapshots((prev) => [data, ...prev]);
    return { success: true, data };
  };

  const deleteSnapshot = async (id) => {
    const { error: err } = await supabase.from('risk_register_snapshots').delete().eq('id', id);
    if (err) return { success: false, error: err.message };
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
    return { success: true };
  };

  return { snapshots, loading, error, saveSnapshot, deleteSnapshot, refresh: fetchSnapshots };
};
