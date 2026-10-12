// The shared hook of source freshness (see model.js). An app hands in the
// source references its project keeps, a resolver that reads the matching
// registry rows as they are now, and the "keep" decisions saved with the
// project. The hook checks when the references change (a project opened,
// an input pulled again) and when asked (check()), and returns the results
// that need the person, with who changed the source where it is known.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compareSource, needsAttention, staleResultsText } from './model.js';

/**
 * @param {{refs: object[], resolve: function(object[]): Promise<Map<string, object|null|undefined>|Object>,
 *   kept?: Object<string,string>, names?: ?function(string[]): Promise<Object<string,string>>,
 *   whoChanged?: ?function(object): Promise<?string>, enabled?: boolean}} o
 *   `resolve` returns, by ref key, the row now (null: gone; undefined or missing: could not be read).
 *   `names` turns updated_by ids into display names; `whoChanged` names the editor of a result
 *   whose row carries no updated_by (a child row whose parent keeps the change log).
 */
export function useSourceFreshness({ refs, resolve, kept = {}, names = null, whoChanged = null, enabled = true }) {
  const [rows, setRows] = useState(null);       // Map key -> row | null | undefined
  const [who, setWho] = useState({});           // key -> display name
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState(null);
  const [error, setError] = useState(null);
  const refsRef = useRef(refs);
  refsRef.current = refs;
  const run = useRef(0);
  // the references by what identifies them and their stamp: a new pull or a
  // newly opened project checks again, a re-render does not
  const signature = useMemo(() => (refs || []).map((r) => `${r.key}|${r.id}|${r.fingerprint || ''}|${r.version ?? ''}|${r.updated_at || ''}|${r.used_at || ''}`).join(';'), [refs]);

  const check = useCallback(async () => {
    const list = refsRef.current || [];
    const mine = ++run.current;
    if (!list.length) { setRows(new Map()); setWho({}); setError(null); return; }
    setChecking(true);
    try {
      const got = await resolve(list);
      const map = got instanceof Map ? got : new Map(Object.entries(got || {}));
      if (mine !== run.current) return;
      setRows(map);
      setError(null);
      setCheckedAt(new Date().toISOString());
      // who: updated_by ids through `names`, otherwise the app's own lookup
      const pending = needsAttention(list.map((ref) => compareSource(ref, map.get(ref.key), {})));
      const ids = [...new Set(pending.map((r) => r.changedById).filter(Boolean))];
      const out = {};
      if (ids.length && names) {
        try {
          const n = (await names(ids)) || {};
          for (const r of pending) if (r.changedById && n[r.changedById]) out[r.key] = n[r.changedById];
        } catch { /* names are a nicety */ }
      }
      if (whoChanged) {
        for (const r of pending) {
          if (out[r.key] || r.status !== 'changed') continue;
          try { const n = await whoChanged(r); if (n) out[r.key] = n; } catch { /* not known */ }
        }
      }
      if (mine === run.current) setWho(out);
    } catch (e) {
      if (mine === run.current) setError(e?.message || 'The registry could not be read.');
    } finally {
      if (mine === run.current) setChecking(false);
    }
  }, [resolve, names, whoChanged]);

  useEffect(() => {
    if (!enabled) return;
    check();
  }, [signature, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    if (!rows) return [];
    return (refs || []).map((ref) => ({ ...compareSource(ref, rows.get(ref.key), kept), changedBy: who[ref.key] || null }));
  }, [rows, refs, kept, who]);
  const items = useMemo(() => needsAttention(results), [results]);
  const staleText = useMemo(() => staleResultsText(results), [results]);

  return { items, results, checking, checkedAt, error, check, staleText, rowFor: (key) => rows?.get(key) };
}

export default useSourceFreshness;
