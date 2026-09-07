// Zone parameter table (Petrophysics Studio PT9c): every parameter down
// the side, Global plus one column per zone across, so the whole
// per-zone workflow of a well is one screen instead of a scope picker
// visited zone by zone. Cells edit in place; Apply writes each zone's
// patch through the same override model the Parameter panel uses (a
// value equal to global is no override). Copy takes another zone's
// overrides, or Global to clear.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FIELDS, visibleField } from '../services/paramFields';
import { buildZoneTable, effectiveFor, patchesFromDrafts } from '../services/zoneParamTable';

const cellCls = 'w-full min-w-[5.5rem] rounded bg-slate-950 border px-1 py-0.5 text-xs text-slate-200';
const fmtVal = (v) => (typeof v === 'number' ? String(Number(v.toPrecision(6))) : String(v ?? ''));

export default function ZoneParamTable({
  open, onOpenChange, params, zones = [], zoneParams = {}, onApply, onStatus,
}) {
  // draft: zoneId -> merged parameter draft (strings while typing)
  const [draft, setDraft] = useState({});
  useEffect(() => {
    if (!open) return;
    const d = {};
    for (const z of zones) d[z.id] = effectiveFor(params, zoneParams, z.id);
    setDraft(d);
  }, [open, params, zones, zoneParams]);

  const rows = useMemo(() => buildZoneTable({ params, zones, zoneParams, sections: FIELDS }), [params, zones, zoneParams]);
  const { patches, invalid } = useMemo(() => patchesFromDrafts(params, draft), [params, draft]);
  const invalidCount = Object.values(invalid).reduce((n, keys) => n + keys.length, 0);
  const dirty = useMemo(() => zones.some((z) => {
    const cur = zoneParams[z.id] || {};
    const nxt = patches[z.id] || {};
    return JSON.stringify(cur) !== JSON.stringify(nxt);
  }), [zones, zoneParams, patches]);

  const setCell = (zoneId, key, value) => setDraft((d) => ({ ...d, [zoneId]: { ...d[zoneId], [key]: value } }));

  const copyFrom = (toId, fromId) => setDraft((d) => ({
    ...d,
    [toId]: fromId === 'global' ? { ...params } : { ...(d[fromId] || effectiveFor(params, zoneParams, fromId)) },
  }));

  const apply = () => {
    if (invalidCount) return;
    onApply(patches);
    const n = Object.values(patches).reduce((s, p) => s + Object.keys(p).length, 0);
    onStatus?.(`Applied the zone table: ${n} override(s) across ${zones.length} zone(s).`);
    onOpenChange(false);
  };

  // differs-from-global on the DRAFT, so a cell lights up as you type
  const isOverride = (zoneId, key) => {
    const v = draft[zoneId]?.[key];
    const g = params[key];
    if (typeof g === 'number') return Number(v) !== g;
    return String(v) !== String(g);
  };

  let section = null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-auto bg-slate-900 border-slate-700 text-slate-200" data-testid="petro-zone-table">
        <DialogHeader>
          <DialogTitle>Zone parameter table</DialogTitle>
          <DialogDescription className="text-slate-400">
            One column per zone. A highlighted cell differs from Global and becomes that zone&apos;s
            override on Apply; set it back to the global value to remove the override. Greyed cells
            do not apply under that zone&apos;s models.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-auto rounded border border-slate-800">
          <table className="text-xs border-collapse min-w-full">
            <thead className="sticky top-0 bg-slate-900 z-10">
              <tr>
                <th className="text-left px-2 py-1 text-slate-400 font-normal">Parameter</th>
                <th className="text-left px-2 py-1 text-slate-400 font-normal">Global</th>
                {zones.map((z) => (
                  <th key={z.id} className="text-left px-2 py-1 font-normal">
                    <div className="text-slate-200">{z.name}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <select
                        className="rounded bg-slate-950 border border-slate-700 text-slate-400 px-1 py-0.5 text-[10px]"
                        value=""
                        data-testid={`petro-zt-copy-${z.name}`}
                        title="Copy another zone's values into this column (Global clears every override)"
                        onChange={(e) => { if (e.target.value) copyFrom(z.id, e.target.value); }}
                      >
                        <option value="">Copy from…</option>
                        <option value="global">Global (clear)</option>
                        {zones.filter((o) => o.id !== z.id).map((o) => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const header = r.section !== section ? r.section : null;
                section = r.section;
                const f = FIELDS.find((x) => x.key === r.key);
                return (
                  <React.Fragment key={r.key}>
                    {header && (
                      <tr>
                        <td colSpan={2 + zones.length} className="px-2 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                          {header}
                        </td>
                      </tr>
                    )}
                    <tr className="border-t border-slate-800/60">
                      <td className="px-2 py-0.5 text-slate-400 whitespace-nowrap">{r.label}</td>
                      <td className="px-2 py-0.5 text-slate-500 whitespace-nowrap" data-testid={`petro-zt-global-${r.key}`}>{fmtVal(r.global)}</td>
                      {zones.map((z) => {
                        const d = draft[z.id] || {};
                        const applies = visibleField(f, d);
                        const over = applies && isOverride(z.id, r.key);
                        const bad = invalid[z.id]?.includes(r.key);
                        const border = bad ? 'border-red-500/70' : over ? 'border-cyan-500/70 bg-cyan-500/10' : 'border-slate-800';
                        return (
                          <td key={z.id} className="px-1 py-0.5">
                            {!applies ? (
                              <span className="block px-1 text-slate-600" title="Not used by this zone's models">·</span>
                            ) : r.options ? (
                              <select
                                className={`${cellCls} ${border}`}
                                value={String(d[r.key] ?? '')}
                                data-testid={`petro-zt-${z.name}-${r.key}`}
                                onChange={(e) => setCell(z.id, r.key, e.target.value)}
                              >
                                {r.options.map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : (
                              <input
                                className={`${cellCls} ${border}`}
                                value={typeof d[r.key] === 'number' ? fmtVal(d[r.key]) : String(d[r.key] ?? '')}
                                data-testid={`petro-zt-${z.name}-${r.key}`}
                                onChange={(e) => setCell(z.id, r.key, e.target.value)}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <DialogFooter className="flex items-center gap-2">
          <span className="mr-auto text-[11px] text-slate-500" data-testid="petro-zone-table-summary">
            {invalidCount ? `${invalidCount} cell(s) are not numbers` : `${Object.values(patches).reduce((s, p) => s + Object.keys(p).length, 0)} override(s) on Apply`}
          </span>
          <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            data-testid="petro-zone-table-apply"
            disabled={!dirty || invalidCount > 0}
            className="bg-cyan-700 hover:bg-cyan-600 text-white"
            onClick={apply}
          >
            Apply to zones
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
