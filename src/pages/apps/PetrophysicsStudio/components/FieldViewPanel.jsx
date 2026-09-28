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
import { computeWellZoned } from '../engine/pipeline';
import { zoneReport, verticalSampleThickness } from '../services/zoneAverages';
import { computeFlattening, allTopNames } from '../engine/section';
import { depthLabel } from '../viewer/depthModes';
import { activeTemplate } from '../layout/layoutSchema';
import { resolveTracks } from '../layout/resolveTracks';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const inputCls = 'rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-0.5 text-xs';
const MAX_WELLS = 8;
const FIELD_SOURCES = new Set(['input:GR', 'output:PHIE', 'output:PHIT', 'output:SW', 'output:PAY']);
const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? EMPTY_VALUE : Number(v).toFixed(d));

export default function FieldViewPanel({
  depthUnit = 'm',
  topStyles = null,
  onShowAllTops = null,
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
           
          const [{ curves, logs }, tops, zones] = await Promise.all([
            curvesCache.getCurves(id), backend.listTops(id), backend.listZones(id),
          ]);
          if (!live) return;
          if (!curves.DEPT) {
            onStatus(`${wells.find((w) => w.id === id)?.name || id} has no depth curve, so it was skipped.`);
            setPickedIds((ids) => ids.filter((x) => x !== id));
            continue;
          }
          setLoaded((m) => ({ ...m, [id]: { curves, logs, tops, zones } }));
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
        && (t.curves || []).some((c) => FIELD_SOURCES.has(c.source) || String(c.source).startsWith('log:'))),
    };
  }, [layouts]);

  // per-well compute with the well's own zones + the interpretation's overrides
  const fieldWells = useMemo(() => pickedIds
    .filter((id) => loaded[id])
    .map((id) => {
      const { curves, logs, tops, zones } = loaded[id];
      const zoneList = zones
        .filter((z) => zoneParams[z.id] && Object.keys(zoneParams[z.id]).length)
        .map((z) => ({ top: z.top_md_m, base: z.base_md_m, params: zoneParams[z.id] }))
        .sort((a, b) => a.top - b.top);
      const { outputs } = computeWellZoned(curves, params, zoneList);
      return {
        id,
        name: wells.find((w) => w.id === id)?.name || id,
        well: wells.find((w) => w.id === id) || null,
        curves,
        outputs,
        tops,
        zones,
        tracks: resolveTracks(fieldTemplate, { curves, outputs, logs, faciesData: null, facies: [], params }),
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
        return zoneReport(w.curves, w.outputs, merged, z, { vth: verticalSampleThickness(w.curves.DEPT, w.well) });
      }),
    }));
  }, [fieldWells, params, zoneParams]);

  return (
    <div className="h-full min-h-0 flex flex-col" data-testid="petro-field">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-pl-border text-xs flex-wrap">
        <span className="text-pl-muted">Wells</span>
        {wells.map((w) => (
          <label key={w.id} className="flex items-center gap-1 text-pl-muted">
            <input
              type="checkbox"
              data-testid={`petro-field-pick-${w.name}`}
              checked={pickedIds.includes(w.id)}
              onChange={() => toggle(w.id)}
            />
            {w.name}
          </label>
        ))}
        <label className="ml-auto flex items-center gap-1 text-pl-muted">Datum
          <select className={inputCls} data-testid="petro-field-datum" value={datumTop}
            onChange={(e) => setDatumTop(e.target.value)}
          >
            <option value="">Structural (MD)</option>
            {topNames.map((n) => <option key={n} value={n}>Flatten on {n}</option>)}
          </select>
        {onShowAllTops && (
          <label className="flex items-center gap-1 text-xs text-pl-muted ml-2">
            <input type="checkbox" checked={topStyles?.showAll !== false} onChange={(e) => onShowAllTops(e.target.checked)} data-testid="petro-field-tops" />
            Tops
          </label>
        )}
        </label>
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-pl-muted" />}
      </div>

      <div className="flex-1 min-h-0">
        {tracksWells.length ? (
          <MultiWellTracks topStyles={topStyles} wells={tracksWells} />
        ) : (
          <div className="h-full flex items-center justify-center text-pl-muted text-sm">
            Pick wells above to compare them side by side.
          </div>
        )}
      </div>

      {summaryRows.length > 0 && (
        <div className="max-h-40 overflow-auto border-t border-pl-border" data-testid="petro-field-summary">
          <table className="w-full text-[11px] text-pl-text">
            <thead>
              <tr className="text-pl-muted">
                <th className="text-left px-2 py-1">Zone</th>
                {fieldWells.map((w) => (
                  <th key={w.id} className="text-left px-2 py-1">{w.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.key} className="border-t border-pl-border" data-testid={`petro-field-zone-${row.display}`}>
                  <td className="px-2 py-1 text-pl-text">{row.display}</td>
                  {row.cells.map((s, i) => (
                    <td key={fieldWells[i].id} className="px-2 py-1">
                      {s
                        ? `net ${depthLabel(s.net_m, depthUnit)} · N/G ${fmt(s.ntg, 2)} · φ ${fmt(s.phi_avg, 3)} · Sw ${fmt(s.sw_avg, 3)}`
                        : EMPTY_VALUE}
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
