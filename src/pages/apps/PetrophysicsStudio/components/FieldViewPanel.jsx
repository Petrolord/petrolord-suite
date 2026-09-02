// Field view (Petrophysics Studio PS9, audit C1): the current global
// parameter set applied across selected wells side by side — the
// cross-well parameter QC the audit describes. Wells load through the
// PS7 curves cache; each computes with its OWN zones and the
// interpretation's per-zone overrides; the compact column set is the
// active template filtered to the field keys. Below the columns, the
// zone summary table matches zones by case-insensitive trimmed name —
// unmatched cells show a dash, never a guess.

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import MultiWellTracks from './MultiWellTracks';
import { computeWellZoned, zoneSummary } from '../engine/pipeline';
import { computeFlattening, allTopNames } from '../engine/section';
import { activeTemplate } from '../layout/layoutSchema';
import { resolveTracks } from '../layout/resolveTracks';

const inputCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';
const MAX_WELLS = 8;
const FIELD_SOURCES = new Set(['input:GR', 'output:PHIE', 'output:SW', 'output:PAY']);
const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(d));

export default function FieldViewPanel({
  wells, params, zoneParams, layouts, backend, curvesCache, onStatus,
}) {
  const [pickedIds, setPickedIds] = useState([]);
  const [loaded, setLoaded] = useState({}); // wellId -> {curves, tops, zones}
  const [datumTop, setDatumTop] = useState(''); // '' = structural
  const [busy, setBusy] = useState(false);

  const toggle = (id) => setPickedIds((ids) => {
    if (ids.includes(id)) return ids.filter((x) => x !== id);
    if (ids.length >= MAX_WELLS) {
      onStatus(`Field view compares up to ${MAX_WELLS} wells.`);
      return ids;
    }
    return [...ids, id];
  });

  useEffect(() => {
    let live = true;
    (async () => {
      setBusy(true);
      for (const id of pickedIds) {
        if (loaded[id]) continue;
        try {
           
          const [{ curves }, tops, zones] = await Promise.all([
            curvesCache.getCurves(id), backend.listTops(id), backend.listZones(id),
          ]);
          if (!live) return;
          if (!curves.DEPT) {
            onStatus(`${wells.find((w) => w.id === id)?.name || id} has no depth curve — skipped.`);
            setPickedIds((ids) => ids.filter((x) => x !== id));
            continue;
          }
          setLoaded((m) => ({ ...m, [id]: { curves, tops, zones } }));
        } catch (e) {
          if (live) onStatus(e.message);
        }
      }
      if (live) setBusy(false);
    })();
    return () => { live = false; };
  }, [pickedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // compact field template: the active layout filtered to the field keys
  const fieldTemplate = useMemo(() => {
    const tpl = activeTemplate(layouts);
    return {
      ...tpl,
      tracks: tpl.tracks.filter((t) => t.type !== 'strip'
        && (t.curves || []).some((c) => FIELD_SOURCES.has(c.source))),
    };
  }, [layouts]);

  // per-well compute with the well's own zones + the interpretation's overrides
  const fieldWells = useMemo(() => pickedIds
    .filter((id) => loaded[id])
    .map((id) => {
      const { curves, tops, zones } = loaded[id];
      const zoneList = zones
        .filter((z) => zoneParams[z.id] && Object.keys(zoneParams[z.id]).length)
        .map((z) => ({ top: z.top_md_m, base: z.base_md_m, params: zoneParams[z.id] }))
        .sort((a, b) => a.top - b.top);
      const { outputs } = computeWellZoned(curves, params, zoneList);
      return {
        id,
        name: wells.find((w) => w.id === id)?.name || id,
        curves,
        outputs,
        tops,
        zones,
        tracks: resolveTracks(fieldTemplate, { curves, outputs, faciesData: null, facies: [], params }),
      };
    }), [pickedIds, loaded, params, zoneParams, wells, fieldTemplate]);

  const topNames = useMemo(
    () => allTopNames(fieldWells.map((w) => ({ id: w.id, tops: w.tops }))),
    [fieldWells],
  );

  const flattening = useMemo(() => {
    if (!datumTop) return null;
    return computeFlattening(
      fieldWells.map((w) => ({ id: w.id, tops: w.tops })),
      { mode: 'flatten', topName: datumTop, datumM: 0 },
    );
  }, [fieldWells, datumTop]);

  const tracksWells = fieldWells.map((w) => {
    const f = flattening?.find((x) => x.id === w.id);
    return { ...w, shift: datumTop ? (f?.shift ?? null) : 0, hasDatumTop: f?.hasDatumTop ?? true };
  });

  // zone summary comparison: rows = zone names matched case-insensitive
  const summaryRows = useMemo(() => {
    const names = new Map(); // canonical -> display
    for (const w of fieldWells) {
      for (const z of w.zones) {
        const key = z.name.trim().toLowerCase();
        if (!names.has(key)) names.set(key, z.name.trim());
      }
    }
    return [...names.entries()].map(([key, display]) => ({
      key,
      display,
      cells: fieldWells.map((w) => {
        const z = w.zones.find((x) => x.name.trim().toLowerCase() === key);
        if (!z) return null;
        const merged = { ...params, ...(zoneParams[z.id] || {}) };
        return zoneSummary(w.curves, w.outputs, merged, z);
      }),
    }));
  }, [fieldWells, params, zoneParams]);

  return (
    <div className="h-full min-h-0 flex flex-col" data-testid="petro-field">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800/60 text-xs flex-wrap">
        <span className="text-slate-500">Wells</span>
        {wells.map((w) => (
          <label key={w.id} className="flex items-center gap-1 text-slate-400">
            <input
              type="checkbox"
              data-testid={`petro-field-pick-${w.name}`}
              checked={pickedIds.includes(w.id)}
              onChange={() => toggle(w.id)}
            />
            {w.name}
          </label>
        ))}
        <label className="ml-auto flex items-center gap-1 text-slate-500">Datum
          <select className={inputCls} data-testid="petro-field-datum" value={datumTop}
            onChange={(e) => setDatumTop(e.target.value)}
          >
            <option value="">Structural (MD)</option>
            {topNames.map((n) => <option key={n} value={n}>Flatten on {n}</option>)}
          </select>
        </label>
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />}
      </div>

      <div className="flex-1 min-h-0">
        {tracksWells.length ? (
          <MultiWellTracks wells={tracksWells} />
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500 text-sm">
            Pick wells above to compare them side by side.
          </div>
        )}
      </div>

      {summaryRows.length > 0 && (
        <div className="max-h-40 overflow-auto border-t border-slate-800/60" data-testid="petro-field-summary">
          <table className="w-full text-[11px] text-slate-300">
            <thead>
              <tr className="text-slate-500">
                <th className="text-left px-2 py-1">Zone</th>
                {fieldWells.map((w) => (
                  <th key={w.id} className="text-left px-2 py-1">{w.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.key} className="border-t border-slate-800/40" data-testid={`petro-field-zone-${row.display}`}>
                  <td className="px-2 py-1 text-slate-200">{row.display}</td>
                  {row.cells.map((s, i) => (
                    <td key={fieldWells[i].id} className="px-2 py-1">
                      {s
                        ? `net ${fmt(s.net_m, 1)} m · N/G ${fmt(s.ntg, 2)} · φ ${fmt(s.phi_avg, 3)} · Sw ${fmt(s.sw_avg, 3)}`
                        : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
