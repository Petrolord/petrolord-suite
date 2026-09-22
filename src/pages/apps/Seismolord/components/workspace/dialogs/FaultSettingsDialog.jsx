// Fault settings (the fault mirror of HorizonSettingsDialog): name,
// colour, line weight and opacity shared by the section, 3D and map
// windows. Settings apply LIVE through onChange and persist to
// seismic_faults.params.display (debounced by the controller, each burst
// one undo step); Rename writes the row's name. Presentational: all state
// lives in ViewerPanel.

import React, { useEffect, useState } from 'react';
import { Slash, Check } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FAULT_COLORS, faultColorFor } from '../interpretationColors';

export const FAULT_LINE_WIDTHS = [
  { value: 1, label: 'Normal' },
  { value: 1.5, label: 'Bold' },
  { value: 2, label: 'Heavy' },
  { value: 3, label: 'Extra heavy' },
];

const selectCls = 'rounded-md bg-slate-950 border border-slate-700 '
  + 'text-slate-200 px-1.5 py-1 text-xs';
const inputCls = 'rounded-md bg-slate-950 border border-slate-700 '
  + 'text-slate-200 px-2 py-1 text-xs';

const FieldRow = ({ label, children, hint }) => (
  <div className="flex items-center gap-3 py-1">
    <span className="w-28 shrink-0 text-xs text-slate-400">{label}</span>
    {children}
    {hint && <span className="text-[11px] text-slate-600">{hint}</span>}
  </div>
);

/**
 * @param {Object} p
 * @param {boolean} p.open
 * @param {(open: boolean) => void} p.onOpenChange
 * @param {?Object} p.fault seismic_faults row being styled
 * @param {Object} p.display current display settings (row + session edits)
 * @param {(partial: Object) => void} p.onChange live-merge a settings change
 * @param {(name: string) => void} p.onRename commit a rename
 * @param {boolean} [p.saving] persistence in flight (badge only)
 */
export default function FaultSettingsDialog({
  open, onOpenChange, fault, display = {}, onChange, onRename, saving = false,
}) {
  const [name, setName] = useState(fault?.name || '');
  useEffect(() => { setName(fault?.name || ''); }, [fault]);
  if (!fault) return null;

  const colour = faultColorFor(fault, display);
  const nSticks = (fault.sticks || []).length;
  const nPoints = (fault.sticks || []).reduce((n, st) => n + (st.points || []).length, 0);
  const opacityPct = Math.round((display.opacity ?? 1) * 100);
  const canRename = name.trim() && name.trim() !== fault.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center text-white">
            <Slash className="w-5 h-5 mr-2" style={{ color: colour }} />
            Fault settings
            {saving && <span className="ml-3 text-xs font-normal text-slate-500">saving…</span>}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {`${nSticks} stick${nSticks === 1 ? '' : 's'}, ${nPoints} points. `}
            Changes apply at once, save with the interpretation and can be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="text-sm text-slate-300">
          <FieldRow label="Name">
            <input
              className={`${inputCls} flex-1 min-w-0`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canRename) onRename(name.trim()); }}
              aria-label="Fault name"
            />
            <Button
              variant="outline" size="sm"
              disabled={!canRename}
              onClick={() => onRename(name.trim())}
            >
              Rename
            </Button>
          </FieldRow>

          <FieldRow label="Colour">
            <div className="flex items-center gap-1.5 flex-wrap">
              {FAULT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  aria-label={`Colour ${c}`}
                  className="w-6 h-6 rounded border border-slate-600 flex items-center justify-center"
                  style={{ background: c }}
                  onClick={() => onChange({ color: c })}
                >
                  {display.color === c && <Check className="w-3.5 h-3.5 text-slate-950" />}
                </button>
              ))}
              <input
                type="color"
                title="Custom colour"
                aria-label="Custom colour"
                className="w-8 h-6 rounded border border-slate-600 bg-transparent cursor-pointer"
                value={colour}
                onChange={(e) => onChange({ color: e.target.value })}
              />
            </div>
          </FieldRow>

          <FieldRow label="Line weight" hint="sticks on sections">
            <select
              className={selectCls}
              value={String(display.lineWidth || 1)}
              onChange={(e) => onChange({ lineWidth: Number(e.target.value) })}
              aria-label="Line weight"
            >
              {FAULT_LINE_WIDTHS.map((w) => (
                <option key={w.value} value={String(w.value)}>{w.label}</option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="Opacity">
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              className="w-40 accent-orange-400"
              value={opacityPct}
              onChange={(e) => onChange({ opacity: Number(e.target.value) / 100 })}
              aria-label="Opacity"
            />
            <span className="text-xs text-slate-400 w-10">{`${opacityPct}%`}</span>
          </FieldRow>
          <p className="text-[11px] text-slate-500 mt-1">
            Opacity applies to the sticks on sections and to the sticks and
            fault surface in the 3D window.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
