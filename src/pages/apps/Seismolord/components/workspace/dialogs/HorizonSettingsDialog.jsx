// Horizon settings (Petrel-style "Settings" on a horizon): identity,
// interpretation color / line weight shared by every viewport, and the
// map window's display style (colormap, fill opacity, contours, color
// range). Settings apply LIVE through onChange and persist to
// seismic_horizons.params.display (debounced by the controller); Rename
// writes the row's name. Presentational — all state lives in ViewerPanel.

import React, { useEffect, useState } from 'react';
import { Layers, Check } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HORIZON_COLORS } from '../interpretationColors';
import { MAP_COLORMAPS } from '../../MapView';

const LINE_WIDTHS = [
  { value: 1, label: 'Normal' },
  { value: 1.5, label: 'Bold' },
  { value: 2, label: 'Heavy' },
  { value: 3, label: 'Extra heavy' },
];

const selectCls = 'rounded-md bg-slate-950 border border-slate-700 '
  + 'text-slate-200 px-1.5 py-1 text-xs';
const inputCls = 'rounded-md bg-slate-950 border border-slate-700 '
  + 'text-slate-200 px-2 py-1 text-xs w-24';

const SectionTitle = ({ children }) => (
  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mt-4 mb-2">
    {children}
  </h4>
);

const FieldRow = ({ label, children, hint }) => (
  <div className="flex items-center gap-3 py-1">
    <span className="w-36 shrink-0 text-xs text-slate-400">{label}</span>
    {children}
    {hint && <span className="text-[11px] text-slate-600">{hint}</span>}
  </div>
);

/**
 * @param {Object} p
 * @param {boolean} p.open
 * @param {(open: boolean) => void} p.onOpenChange
 * @param {?Object} p.horizon seismic_horizons row being styled
 * @param {Object} p.display current display settings (merged row + edits)
 * @param {(partial: Object) => void} p.onChange live-merge a settings change
 * @param {(name: string) => void} p.onRename commit a rename
 * @param {boolean} [p.saving] persistence in flight (badge only)
 */
export default function HorizonSettingsDialog({
  open, onOpenChange, horizon, display = {}, onChange, onRename, saving = false,
}) {
  const [name, setName] = useState(horizon?.name || '');
  useEffect(() => { setName(horizon?.name || ''); }, [horizon]);
  if (!horizon) return null;

  const stats = horizon.stats || {};
  const rangeManual = display.rangeMode === 'manual';
  const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? undefined : Number(v));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center text-white">
            <Layers className="w-5 h-5 mr-2" style={{ color: display.color || '#22d3ee' }} />
            Horizon settings
            {saving && <span className="ml-3 text-xs font-normal text-slate-500">saving…</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm text-slate-300">
          <SectionTitle>Horizon</SectionTitle>
          <FieldRow label="Name">
            <input
              className={`${inputCls} flex-1 min-w-0`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim() && name.trim() !== horizon.name) {
                  onRename(name.trim());
                }
              }}
              aria-label="Horizon name"
            />
            <Button
              variant="outline" size="sm"
              disabled={!name.trim() || name.trim() === horizon.name}
              onClick={() => onRename(name.trim())}
            >
              Rename
            </Button>
          </FieldRow>
          <p className="text-[11px] text-slate-500 pl-[9.75rem]">
            {stats.coverage != null && `${Math.round(stats.coverage * 100)}% coverage`}
            {stats.tracked != null && ` · ${Number(stats.tracked).toLocaleString()} picks`}
            {stats.min_twt_ms != null
              && ` · ${stats.min_twt_ms.toFixed(0)}–${stats.max_twt_ms.toFixed(0)} ms TWT`}
          </p>

          <SectionTitle>Interpretation color</SectionTitle>
          <FieldRow label="Color" hint="sections, 3D, map and the explorer">
            <div className="flex items-center gap-1.5">
              {HORIZON_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  aria-label={`Color ${c}`}
                  className="w-6 h-6 rounded border border-slate-600 flex items-center justify-center"
                  style={{ background: c }}
                  onClick={() => onChange({ color: c })}
                >
                  {display.color === c && <Check className="w-3.5 h-3.5 text-slate-950" />}
                </button>
              ))}
              <input
                type="color"
                title="Custom color"
                aria-label="Custom color"
                className="w-8 h-6 rounded border border-slate-600 bg-transparent cursor-pointer"
                value={display.color || '#22d3ee'}
                onChange={(e) => onChange({ color: e.target.value })}
              />
            </div>
          </FieldRow>
          <FieldRow label="Line weight" hint="horizon lines on sections">
            <select
              className={selectCls}
              value={String(display.lineWidth || 1)}
              onChange={(e) => onChange({ lineWidth: Number(e.target.value) })}
              aria-label="Line weight"
            >
              {LINE_WIDTHS.map((w) => (
                <option key={w.value} value={String(w.value)}>{w.label}</option>
              ))}
            </select>
          </FieldRow>

          <SectionTitle>Map display</SectionTitle>
          <FieldRow label="Colormap" hint="overrides the map's colormap for this horizon">
            <select
              className={selectCls}
              value={display.colormap || ''}
              onChange={(e) => onChange({ colormap: e.target.value || undefined })}
              aria-label="Map colormap"
            >
              <option value="">Inherit map setting</option>
              {MAP_COLORMAPS.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Fill opacity">
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              className="w-40 accent-cyan-400"
              value={Math.round((display.opacity ?? 1) * 100)}
              onChange={(e) => onChange({ opacity: Number(e.target.value) / 100 })}
              aria-label="Fill opacity"
            />
            <span className="text-xs text-slate-400 w-10">
              {`${Math.round((display.opacity ?? 1) * 100)}%`}
            </span>
          </FieldRow>
          <FieldRow label="Contours">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                className="accent-cyan-400"
                checked={display.contours !== false}
                onChange={(e) => onChange({ contours: e.target.checked })}
                aria-label="Show contours"
              />
              show contour lines
            </label>
          </FieldRow>
          <FieldRow label="Contour interval" hint="blank = automatic (12 levels)">
            <input
              type="number"
              min="0"
              step="any"
              className={inputCls}
              placeholder="auto"
              value={display.contourStep ?? ''}
              onChange={(e) => onChange({ contourStep: num(e.target.value) })}
              disabled={display.contours === false}
              aria-label="Contour interval"
            />
          </FieldRow>
          <FieldRow label="Color range">
            <select
              className={selectCls}
              value={rangeManual ? 'manual' : 'auto'}
              onChange={(e) => onChange({
                rangeMode: e.target.value === 'manual' ? 'manual' : undefined,
              })}
              aria-label="Color range mode"
            >
              <option value="auto">Automatic (data range)</option>
              <option value="manual">Manual</option>
            </select>
            {rangeManual && (
              <>
                <input
                  type="number"
                  step="any"
                  className={inputCls}
                  placeholder="min"
                  value={display.zMin ?? ''}
                  onChange={(e) => onChange({ zMin: num(e.target.value) })}
                  aria-label="Color range minimum"
                />
                <input
                  type="number"
                  step="any"
                  className={inputCls}
                  placeholder="max"
                  value={display.zMax ?? ''}
                  onChange={(e) => onChange({ zMax: num(e.target.value) })}
                  aria-label="Color range maximum"
                />
              </>
            )}
          </FieldRow>
          <p className="text-[11px] text-slate-500 mt-1">
            Contour interval and color range are in the map's display unit
            (ms TWT, or m / ft when a depth domain is selected). Values
            outside a manual range clamp to its ends.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
