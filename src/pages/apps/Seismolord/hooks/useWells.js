// Well registry state for the workspace controller (extracted from the
// retired WellsPanel). Wells are per-user and volume-independent — they
// live in world coordinates and appear on any survey that contains them.
// `visible` carries computed minimum-curvature world paths so the viewer
// windows just draw.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { listWells, saveWell, deleteWell } from '../services/wellsService';
import { computeWellPath, verticalWellPath } from '../engine/wellPath';
import { wellColor } from '../components/workspace/interpretationColors';

/** World path of a well row (deviated via minimum curvature; header-only
 *  rows are vertical). Returns null when the row can't produce one. */
export function wellWorldPath(row) {
  const opts = { surfaceX: row.surface_x, surfaceY: row.surface_y, kb: row.kb_m || 0 };
  try {
    if (Array.isArray(row.deviation) && row.deviation.length >= 2) {
      return computeWellPath(row.deviation, opts);
    }
    if (row.td_md_m > 0) return verticalWellPath({ ...opts, td: row.td_md_m });
  } catch {
    return null;
  }
  return null;
}

export default function useWells() {
  const { toast } = useToast();
  const [wells, setWells] = useState([]);
  const [visibleIds, setVisibleIds] = useState(new Set());
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      setWells(await listWells());
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // visible wells with computed paths for the viewer windows
  const visible = useMemo(() => wells
    .map((w, idx) => ({ row: w, idx }))
    .filter(({ row }) => visibleIds.has(row.id))
    .map(({ row, idx }) => ({
      id: row.id,
      name: row.name,
      color: wellColor(idx),
      surfaceX: row.surface_x,
      surfaceY: row.surface_y,
      kbM: row.kb_m || 0,
      tops: row.tops || [],
      checkshots: row.checkshots || [],
      deviation: row.deviation || [],
      path: wellWorldPath(row),
    })), [wells, visibleIds]);

  /** WellImport's onSave: persist, make visible, refresh the list. */
  const save = useCallback(async (draft) => {
    const row = await saveWell(draft);
    setVisibleIds((s) => new Set([...s, row.id]));
    await reload();
    toast({
      title: 'Well saved',
      description: `${row.name}: ${draft.deviation.length || 'vertical'}`
        + `${draft.deviation.length ? ' stations' : ''}, ${draft.tops.length} tops, `
        + `${draft.checkshots.length} checkshots.`,
    });
    return row;
  }, [reload, toast]);

  const toggle = useCallback((w) => setVisibleIds((s) => {
    const next = new Set(s);
    if (next.has(w.id)) next.delete(w.id);
    else next.add(w.id);
    return next;
  }), []);

  const setAllVisible = useCallback((on) => {
    setVisibleIds(() => (on ? new Set(wells.map((w) => w.id)) : new Set()));
  }, [wells]);

  const remove = useCallback(async (w) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete well "${w.name}"?`)) return;
    setBusyId(w.id);
    try {
      await deleteWell(w);
      setVisibleIds((s) => { const n = new Set(s); n.delete(w.id); return n; });
      await reload();
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  }, [reload, toast]);

  return {
    wells, visibleIds, visible, busyId, error, reload, save, toggle, setAllVisible, remove,
  };
}
