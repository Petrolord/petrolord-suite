// Layer details in Expert mode (AppUpgrade BF-U1-006, 2026-10-01). Expert
// mode could set a layer's name, ages, thickness and lithology only: the
// source rock (TOC, HI, kerogen) was settable in the guided wizard alone,
// so a model sent from Stratigraphy Studio or built from tops could never
// generate, and the thermal and compaction properties the engine reads
// (matrix conductivity, radiogenic heat, Athy surface porosity and
// coefficient) were invisible. Units as published: conductivity W/(m K),
// radiogenic heat in microW/m3, the compaction coefficient per km
// (Sclater and Christie 1980); stored SI per metre.

import React from 'react';
import { NumText } from '@/components/wells/LayoutPanel';
import { getThermalProps } from '../../services/ThermalPropertiesLibrary';
import { getCompactionParams } from '../../services/CompactionModelLibrary';
import { staleOverrides, withLibraryProperties } from '../../services/honesty';

const inputCls = 'h-7 w-full rounded border border-pl-border-strong bg-pl-surface px-1.5 text-xs text-pl-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pl-focus';
const KEROGENS = [['type1', 'Type I (lacustrine, oil prone)'], ['type2', 'Type II (marine)'], ['type3', 'Type III (terrestrial, gas prone)']];

/** 'Type II', 'type2' or a kinetics object to the select value. */
export function kerogenKey(k) {
  if (k && typeof k === 'object') return 'custom';
  const c = String(k || 'type2').toLowerCase().replace(/\s+/g, '');
  if (c === 'type1' || c === 'typei') return 'type1';
  if (c === 'type3' || c === 'typeiii') return 'type3';
  return 'type2';
}

const Field = ({ label, unit, children, testid }) => (
  <label className="block" data-testid={testid}>
    <span className="text-[10px] text-pl-muted">{label}{unit ? ` (${unit})` : ''}</span>
    {children}
  </label>
);

export default function LayerDetails({ layer, dispatch, readOnly = false }) {
  const set = (payload) => dispatch({ type: 'UPDATE_LAYER', id: layer.id, payload });
  const sr = layer.sourceRock || { isSource: false, toc: 0, hi: 0, kerogen: 'type2' };
  const setSr = (patch) => set({ sourceRock: { ...sr, ...patch } });
  const libT = getThermalProps(layer.lithology); const libC = getCompactionParams(layer.lithology);
  const th = { ...libT, ...(layer.thermal || {}) };
  const co = { ...libC, ...(layer.compaction || {}) };
  const setTh = (patch) => set({ thermal: { conductivity: th.conductivity, radiogenic: th.radiogenic, heatCapacity: th.heatCapacity, ...patch } });
  const setCo = (patch) => set({ compaction: { model: 'exponential', phi0: co.phi0, c: co.c, ...patch } });
  const stale = staleOverrides(layer);
  const kKey = kerogenKey(sr.kerogen);
  const custom = (v, lib) => Number.isFinite(Number(v)) && Math.abs(Number(v) - lib) > 1e-12 * Math.max(1, Math.abs(lib));

  return (
    <div className="space-y-3 pt-2 border-t border-pl-border text-xs" data-testid="bf-layer-details">
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-pl-text">
          <input type="checkbox" checked={!!sr.isSource} disabled={readOnly} data-testid="bf-layer-source"
            onChange={(e) => setSr(e.target.checked
              ? { isSource: true, toc: Number(sr.toc) > 0 ? sr.toc : 2, hi: Number(sr.hi) > 0 ? sr.hi : 400, kerogen: sr.kerogen || 'type2' }
              : { isSource: false })} />
          Source rock
        </label>
        {sr.isSource && (
          <div className="grid grid-cols-3 gap-2">
            <Field label="TOC" unit="wt %"><NumText className={inputCls} value={sr.toc} onCommit={(v) => setSr({ toc: v })} data-testid="bf-layer-toc" disabled={readOnly} /></Field>
            <Field label="HI" unit="mg HC/g TOC"><NumText className={inputCls} value={sr.hi} onCommit={(v) => setSr({ hi: v })} data-testid="bf-layer-hi" disabled={readOnly} /></Field>
            <Field label="Kerogen">
              <select className={inputCls} value={kKey} disabled={readOnly || kKey === 'custom'} data-testid="bf-layer-kerogen"
                onChange={(e) => setSr({ kerogen: e.target.value })}>
                {kKey === 'custom' && <option value="custom">Custom kinetics</option>}
                {KEROGENS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Matrix conductivity" unit="W/(m K)" testid="bf-layer-k-field">
          <NumText className={inputCls} value={Number(th.conductivity)} onCommit={(v) => Number(v) > 0 && setTh({ conductivity: v })} data-testid="bf-layer-k" disabled={readOnly} />
        </Field>
        <Field label="Radiogenic heat" unit="microW/m3">
          <NumText className={inputCls} value={Number((Number(th.radiogenic) * 1e6).toPrecision(6))} onCommit={(v) => Number(v) >= 0 && setTh({ radiogenic: v * 1e-6 })} data-testid="bf-layer-a" disabled={readOnly} />
        </Field>
        <Field label="Heat capacity" unit="J/(kg K)">
          <NumText className={inputCls} value={Number(th.heatCapacity)} onCommit={(v) => Number(v) > 0 && setTh({ heatCapacity: v })} data-testid="bf-layer-cp" disabled={readOnly} />
        </Field>
        <Field label="Surface porosity" unit="fraction">
          <NumText className={inputCls} value={Number(co.phi0)} onCommit={(v) => Number(v) >= 0 && Number(v) < 1 && setCo({ phi0: v })} data-testid="bf-layer-phi0" disabled={readOnly} />
        </Field>
        <Field label="Compaction coefficient" unit="1/km">
          <NumText className={inputCls} value={Number((Number(co.c) * 1000).toPrecision(6))} onCommit={(v) => Number(v) >= 0 && setCo({ c: v / 1000 })} data-testid="bf-layer-c" disabled={readOnly} />
        </Field>
        <div className="flex items-end">
          <button type="button" disabled={readOnly} data-testid="bf-layer-library"
            className="h-7 w-full rounded border border-pl-border text-[11px] text-pl-text hover:bg-pl-sunken disabled:opacity-40"
            title={`Set the five properties to the ${layer.lithology} library values`}
            onClick={() => set(withLibraryProperties(layer))}>
            Use {layer.lithology} library
          </button>
        </div>
      </div>
      {(custom(th.conductivity, libT.conductivity) || custom(co.phi0, libC.phi0) || custom(co.c, libC.c) || custom(th.radiogenic, libT.radiogenic) || custom(th.heatCapacity, libT.heatCapacity)) && (
        <p className="text-[11px] text-pl-muted" data-testid="bf-layer-custom">Some properties differ from the {layer.lithology} library ({libT.conductivity} W/(m K), {(libT.radiogenic * 1e6).toFixed(1)} microW/m3, porosity {libC.phi0} with {(libC.c * 1000).toFixed(2)}/km).</p>
      )}
      {stale && (
        <p className="text-[11px] text-pl-warning-text" data-testid="bf-layer-stale">
          These are {stale.from} values saved by an earlier release on a {layer.lithology} layer; the engine uses them as typed.
        </p>
      )}
    </div>
  );
}
