import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

/**
 * AS2 — a risk's tags and its links, read from the tables that hold
 * them.
 *
 * The detail page used to print two hardcoded badges, "Drilling" and
 * "High Priority", on every risk in every organization, and one
 * hardcoded linked risk, "RSK-1002 (Dependency)". Both were literals in
 * the JSX. `risk_tags` and `risk_links` existed the whole time and the
 * app had never written to or read from either.
 */
export const useRiskChildren = (riskId, register = []) => {
  const [tags, setTags] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    if (!riskId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [tagRes, linkRes] = await Promise.all([
        supabase.from('risk_tags').select('id, tag').eq('risk_id', riskId),
        supabase
          .from('risk_links')
          .select('id, source_risk_id, target_risk_id, link_type')
          .or(`source_risk_id.eq.${riskId},target_risk_id.eq.${riskId}`),
      ]);
      if (tagRes.error) throw tagRes.error;
      if (linkRes.error) throw linkRes.error;
      setTags(tagRes.data || []);
      setLinks(linkRes.data || []);
    } catch (err) {
      // No invented fallback. An empty list of tags is an empty list of
      // tags, and a failure says so.
      setError(err.message || 'Could not load this risk’s tags and links.');
      setTags([]);
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [riskId]);

  useEffect(() => { fetch(); }, [fetch]);

  /** The other end of each link, resolved against the register we hold. */
  const linkedRisks = links
    .map((l) => {
      const otherId = l.source_risk_id === riskId ? l.target_risk_id : l.source_risk_id;
      const other = register.find((r) => r.id === otherId);
      return other
        ? { id: l.id, riskId: other.id, code: other.risk_id, title: other.title, type: l.link_type }
        : null;
    })
    .filter(Boolean);

  return { tags, links, linkedRisks, loading, error, refresh: fetch };
};
