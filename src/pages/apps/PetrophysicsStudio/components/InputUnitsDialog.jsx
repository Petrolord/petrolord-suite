// Input units (AppUpgrade PETRO-U2-001): one table for the conversions the
// Studio applies to its inputs, and the place to correct them. Each mapped
// NPHI, RHOB and DT row says the unit stored on the curve, what the Studio
// reads it as, the factor, and why (the file's unit, the values' range, the
// user's setting). A setting here applies in this interpretation; on a well
// you own, "Save to well" writes the unit onto the registry curve (samples
// untouched, the change recorded in its provenance), so every app reads it.

import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UNIT_FAMILIES, unitChoices } from '@/components/wells/unitFamilies';
import { EMPTY_VALUE } from '@/lib/emptyValue';

export const REASON_TEXT = {
  file: 'the unit stored on the curve',
  range: 'the values (no stored unit could mean them)',
  override: 'your setting',
  pipeline: 'already the pipeline unit',
  unknown: 'unit not recognised; read as the pipeline unit',
};

const fmtFactor = (f) => (f === 1 ? '1' : Number(f.toPrecision(6)).toString());

export default function InputUnitsDialog({
  open, onOpenChange, decisions = [], overrides = {}, isOwn = false, busy = false, onOverride, onSaveToWell,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-testid="petro-input-units-dialog">
        <DialogHeader>
          <DialogTitle>Input units</DialogTitle>
          <DialogDescription className="text-pl-muted">
            The engines take neutron porosity in v/v, bulk density in g/cc and slowness in µs/m. This is what each
            input curve is read as and why. Set a unit where the file is wrong; the same unit table serves Rock Physics.
          </DialogDescription>
        </DialogHeader>
        {!decisions.length ? (
          <p className="text-xs text-pl-muted">This well has no NPHI, RHOB or DT input mapped.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse min-w-full" data-testid="petro-input-units-table">
              <thead>
                <tr className="text-pl-muted">
                  {['Input', 'Curve', 'Stored unit', 'Read as', 'Factor', 'Why', 'Set unit', ''].map((h) => <th key={h} className="text-left px-2 py-1 font-normal">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {decisions.map((d) => {
                  const fam = UNIT_FAMILIES[d.key];
                  const ov = overrides[d.mnemonic] || '';
                  return (
                    <tr key={d.key} className="border-t border-pl-border" data-testid={`petro-input-units-row-${d.key}`}>
                      <td className="px-2 py-1 text-pl-text" title={fam?.quantity}>{d.key}</td>
                      <td className="px-2 py-1 text-pl-text">{d.mnemonic}</td>
                      <td className="px-2 py-1 text-pl-muted">{d.fileUnit || EMPTY_VALUE}</td>
                      <td className="px-2 py-1 text-pl-text" data-testid={`petro-input-units-readas-${d.key}`}>{d.readAs}</td>
                      <td className="px-2 py-1 text-pl-muted">{fmtFactor(d.factor)}</td>
                      <td className={`px-2 py-1 ${d.reason === 'range' || d.reason === 'unknown' ? 'text-pl-warning-text' : 'text-pl-muted'}`} data-testid={`petro-input-units-why-${d.key}`}>
                        {REASON_TEXT[d.reason] || d.reason}
                        {d.sentinels ? `; ${d.sentinels} vendor nulls` : ''}
                      </td>
                      <td className="px-2 py-1">
                        <select
                          className="rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1 py-0.5"
                          value={ov}
                          data-testid={`petro-input-units-set-${d.key}`}
                          onChange={(e) => onOverride(d.mnemonic, e.target.value || null)}
                        >
                          <option value="">Auto</option>
                          {unitChoices(d.key).map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        {isOwn && ov && ov !== d.fileUnit && (
                          <button
                            type="button"
                            disabled={busy}
                            data-testid={`petro-input-units-save-${d.key}`}
                            className="px-1.5 py-0.5 rounded border border-pl-primary/60 text-pl-primary-text hover:bg-pl-primary/10 disabled:opacity-50 whitespace-nowrap"
                            title="Write this unit onto the registry curve so every app reads it (samples untouched; recorded in the curve's provenance)"
                            onClick={() => onSaveToWell(d.mnemonic, ov)}
                          >
                            Save to well
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!isOwn && decisions.length > 0 && (
          <p className="text-[11px] text-pl-muted">Org-shared well: a setting here applies in your interpretation; ask the owner to correct the stored unit.</p>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
