// Wells panel: the per-user well registry (volume-independent — wells
// live in world coordinates and appear on any survey that contains
// them). List with visibility/colors/delete + the WellImport form.
// Visible wells are pushed up through onWellsChange with their
// minimum-curvature world paths already computed, so the map (and
// later the sections/3D windows, Phase W2) just draw.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleDot, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { listWells, saveWell, deleteWell } from '../services/wellsService';
import { computeWellPath, verticalWellPath } from '../engine/wellPath';
import WellImport from './WellImport';

export const WELL_COLORS = ['#fbbf24', '#34d399', '#f472b6', '#38bdf8', '#fb923c', '#e879f9'];

export const wellColor = (index) => WELL_COLORS[index % WELL_COLORS.length];

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

export default function WellsPanel({ onWellsChange }) {
  const { toast } = useToast();
  const [wells, setWells] = useState([]);
  const [visibleIds, setVisibleIds] = useState(new Set());
  const [busyId, setBusyId] = useState(null);
  const [showImport, setShowImport] = useState(false);
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

  useEffect(() => {
    if (onWellsChange) onWellsChange(visible);
  }, [visible, onWellsChange]);

  const onSave = async (draft) => {
    const row = await saveWell(draft);
    setVisibleIds((s) => new Set([...s, row.id]));
    await reload();
    setShowImport(false);
    toast({
      title: 'Well saved',
      description: `${row.name}: ${draft.deviation.length || 'vertical'}`
        + `${draft.deviation.length ? ' stations' : ''}, ${draft.tops.length} tops, `
        + `${draft.checkshots.length} checkshots.`,
    });
  };

  const toggle = (w) => setVisibleIds((s) => {
    const next = new Set(s);
    if (next.has(w.id)) next.delete(w.id);
    else next.add(w.id);
    return next;
  });

  const onDelete = async (w) => {
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
  };

  return (
    <Card className="bg-slate-900/60 border-slate-700">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-white flex items-center">
          <CircleDot className="w-5 h-5 mr-2 text-amber-400" />
          Wells
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => setShowImport((v) => !v)}>
          {showImport ? <X className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
          {showImport ? 'Close' : 'Add well'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {showImport && (
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <WellImport onSave={onSave} />
          </div>
        )}

        {!wells.length && !error && (
          <p className="text-xs text-slate-500">
            No wells yet — add one with a pasted deviation survey, or just name +
            surface X/Y + TD for a vertical well. Visible wells draw on every
            survey map that contains them.
          </p>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}

        <ul className="space-y-1">
          {wells.map((w, idx) => (
            <li key={w.id} className="flex items-center justify-between gap-2 text-sm">
              <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-amber-500"
                  checked={visibleIds.has(w.id)}
                  onChange={() => toggle(w)}
                />
                <CircleDot className="w-3.5 h-3.5 shrink-0" style={{ color: wellColor(idx) }} />
                <span className="text-slate-200 truncate">{w.name}</span>
                <span className="text-slate-500 text-xs whitespace-nowrap">
                  {w.deviation?.length >= 2 ? `${w.deviation.length} stn` : 'vertical'}
                  {w.td_md_m ? ` · TD ${Math.round(w.td_md_m)} m` : ''}
                  {w.tops?.length ? ` · ${w.tops.length} tops` : ''}
                  {w.checkshots?.length ? ' · T-D' : ''}
                </span>
              </label>
              <button
                type="button"
                className="text-red-400/70 hover:text-red-400 shrink-0"
                onClick={() => onDelete(w)}
                disabled={busyId === w.id}
                title="Delete well"
              >
                {busyId === w.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />}
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
