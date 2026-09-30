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
import { FIELDS } from '../services/paramFields';
import { buildZoneTable, effectiveFor, patchesFromDrafts, draftToEngine } from '../services/zoneParamTable';
import { toDisplayDraft } from '../services/paramUnits';
import ParamGrid from './ParamGrid';

export default function ZoneParamTable({
  open, onOpenChange, params, zones = [], zoneParams = {}, onApply, onStatus, unitSystem = 'si',
}) {
  // PETRO-U2-002: cells show slowness, temperatures and the BHT depth in the
  // chosen unit system; patches are built in engine units
  const shownGlobal = useMemo(() => toDisplayDraft(params, unitSystem), [params, unitSystem]);
  // draft: zoneId -> merged parameter draft (strings while typing)
  const [draft, setDraft] = useState({});
  useEffect(() => {
    if (!open) return;
    const d = {};
    for (const z of zones) d[z.id] = toDisplayDraft(effectiveFor(params, zoneParams, z.id), unitSystem);
    setDraft(d);
  }, [open, params, zones, zoneParams, unitSystem]);

  const rows = useMemo(() => buildZoneTable({
    params: shownGlobal, zones, zoneParams: Object.fromEntries(Object.entries(zoneParams).map(([k, v]) => [k, toDisplayDraft(v, unitSystem)])), sections: FIELDS, system: unitSystem,
  }), [shownGlobal, zones, zoneParams, unitSystem]);
  const engineDrafts = useMemo(() => Object.fromEntries(Object.entries(draft).map(([zid, d]) => [zid, draftToEngine(d, effectiveFor(params, zoneParams, zid), unitSystem, params)])), [draft, params, zoneParams, unitSystem]);
  const { patches, invalid } = useMemo(() => patchesFromDrafts(params, engineDrafts), [params, engineDrafts]);
  const invalidCount = Object.values(invalid).reduce((n, keys) => n + keys.length, 0);
  const dirty = useMemo(() => zones.some((z) => {
    const cur = zoneParams[z.id] || {};
    const nxt = patches[z.id] || {};
    return JSON.stringify(cur) !== JSON.stringify(nxt);
  }), [zones, zoneParams, patches]);

  const setCell = (zoneId, key, value) => setDraft((d) => ({ ...d, [zoneId]: { ...d[zoneId], [key]: value } }));

  const copyFrom = (toId, fromId) => setDraft((d) => ({
    ...d,
    [toId]: fromId === 'global' ? { ...shownGlobal } : { ...(d[fromId] || toDisplayDraft(effectiveFor(params, zoneParams, fromId), unitSystem)) },
  }));

  const apply = () => {
    if (invalidCount) return;
    onApply(patches);
    const n = Object.values(patches).reduce((s, p) => s + Object.keys(p).length, 0);
    onStatus?.(`Applied the zone table: ${n} override(s) across ${zones.length} zone(s).`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-auto" data-testid="petro-zone-table">
        <DialogHeader>
          <DialogTitle>Zone parameter table</DialogTitle>
          <DialogDescription className="text-pl-muted">
            One column per zone. A highlighted cell differs from Global and becomes that zone&apos;s
            override on Apply; set it back to the global value to remove the override. Greyed cells
            do not apply under that zone&apos;s models.
          </DialogDescription>
        </DialogHeader>

        <ParamGrid
          rows={rows}
          columns={zones.map((z) => ({ id: z.id, name: z.name }))}
          params={shownGlobal}
          draft={draft}
          invalid={invalid}
          onCell={setCell}
          testPrefix="petro-zt"
          columnHeader={(c) => (
            <div className="flex items-center gap-1 mt-0.5">
              <select
                className="rounded bg-pl-surface border border-pl-border-strong text-pl-muted px-1 py-0.5 text-[10px]"
                value=""
                data-testid={`petro-zt-copy-${c.name}`}
                title="Copy another zone's values into this column (Global clears every override)"
                onChange={(e) => { if (e.target.value) copyFrom(c.id, e.target.value); }}
              >
                <option value="">Copy from…</option>
                <option value="global">Global (clear)</option>
                {zones.filter((o) => o.id !== c.id).map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          )}
        />

        <DialogFooter className="flex items-center gap-2">
          <span className="mr-auto text-[11px] text-pl-muted" data-testid="petro-zone-table-summary">
            {invalidCount ? `${invalidCount} cell(s) are not numbers` : `${Object.values(patches).reduce((s, p) => s + Object.keys(p).length, 0)} override(s) on Apply`}
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            data-testid="petro-zone-table-apply"
            disabled={!dirty || invalidCount > 0}
            onClick={apply}
          >
            Apply to zones
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
