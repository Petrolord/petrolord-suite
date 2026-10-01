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
import { layerLibrary, lithologyLabel, mixPercent, MIX_LITHOLOGIES, KINETICS_OPTIONS, kineticsKey, customKinetics } from '../../services/lithologyMix';
import { PepperCorvi1995 } from '../../services/KerogenLibrary';

const inputCls = 'h-7 w-full rounded border border-pl-border-strong bg-pl-surface px-1.5 text-xs text-pl-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pl-focus';

/** 'Type II', 'type2' or a kinetics object to the select value. */
export function kerogenKey(k) { return kineticsKey(k); }

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
  // U2-013: a mixed layer's library is its mixture
  const lib = layerLibrary(layer);
  const libT = lib.thermal; const libC = lib.compaction;
  const mix = mixPercent(layer);
  const lithName = lithologyLabel(layer);
  const setMix = (k, v) => {
    const next = { sandstone: 0, shale: 0, limestone: 0, ...(layer.lithologyMix || {}), [k]: Math.max(0, Number(v) || 0) };
    if (MIX_LITHOLOGIES.some((x) => next[x] > 0)) set({ lithologyMix: next });
  };
  const cust = (sr.kerogen && typeof sr.kerogen === 'object' && sr.kerogen.custom) || null;
  const setCustom = (patch) => {
    const base = cust || PepperCorvi1995.B;
    const next = { aFactor: base.aFactor, eMeanKJ: base.eMeanKJ, sigmaKJ: base.sigmaKJ, ...patch };
    if (next.aFactor > 0 && next.eMeanKJ > 0 && next.sigmaKJ >= 0) setSr({ kerogen: customKinetics(next) });
  };
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
              <select className={inputCls} value={kKey} disabled={readOnly} data-testid="bf-layer-kerogen"
                onChange={(e) => (e.target.value === 'custom' ? setCustom({}) : setSr({ kerogen: e.target.value }))}>
                {KINETICS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          </div>
        )}
        {sr.isSource && kKey === 'custom' && (
          <div className="grid grid-cols-3 gap-2" data-testid="bf-layer-kinetics">
            {cust ? (
              <>
                <Field label="Frequency factor A" unit="1/s"><NumText className={inputCls} value={cust.aFactor} onCommit={(v) => setCustom({ aFactor: v })} data-testid="bf-layer-kin-a" disabled={readOnly} /></Field>
                <Field label="Mean activation energy" unit="kJ/mol"><NumText className={inputCls} value={cust.eMeanKJ} onCommit={(v) => setCustom({ eMeanKJ: v })} data-testid="bf-layer-kin-e" disabled={readOnly} /></Field>
                <Field label="Spread (standard deviation)" unit="kJ/mol"><NumText className={inputCls} value={cust.sigmaKJ} onCommit={(v) => setCustom({ sigmaKJ: v })} data-testid="bf-layer-kin-s" disabled={readOnly} /></Field>
              </>
            ) : <p className="col-span-3 text-[11px] text-pl-muted">Kinetics set outside the editor (a table of reaction fractions); choose a library set to replace them.</p>}
          </div>
        )}
        {sr.isSource && kKey.startsWith('pc-') && (
          <p className="text-[11px] text-pl-muted" data-testid="bf-layer-kinetics-note">Pepper and Corvi (1995) oil generation: A {PepperCorvi1995[kKey.slice(3)].aFactor.toExponential(2)} 1/s, mean E {PepperCorvi1995[kKey.slice(3)].eMeanKJ} kJ/mol, spread {PepperCorvi1995[kKey.slice(3)].sigmaKJ} kJ/mol.</p>
        )}
      </div>
      {layer.lithology === 'mixed' && (
        <div className="space-y-1" data-testid="bf-layer-mix">
          <div className="grid grid-cols-3 gap-2">
            {MIX_LITHOLOGIES.map((k) => (
              <Field key={k} label={k[0].toUpperCase() + k.slice(1)} unit="parts">
                <NumText className={inputCls} value={Number(layer.lithologyMix?.[k] ?? 0)} onCommit={(v) => setMix(k, v)} data-testid={`bf-layer-mix-${k}`} disabled={readOnly} />
              </Field>
            ))}
          </div>
          <p className="text-[11px] text-pl-muted" data-testid="bf-layer-mix-label">Mixture: {lithName}. Porosity, compaction and heat capacity mix by fraction; conductivity by the geometric mean. Changing the parts resets the properties below to the mixture.</p>
        </div>
      )}
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
            title={`Set the five properties to the ${layer.lithology === 'mixed' ? 'mixture' : `${layer.lithology} library`} values`}
            onClick={() => set(withLibraryProperties(layer))}>
            {layer.lithology === 'mixed' ? 'Use the mixture' : `Use ${layer.lithology} library`}
          </button>
        </div>
      </div>
      {(custom(th.conductivity, libT.conductivity) || custom(co.phi0, libC.phi0) || custom(co.c, libC.c) || custom(th.radiogenic, libT.radiogenic) || custom(th.heatCapacity, libT.heatCapacity)) && (
        <p className="text-[11px] text-pl-muted" data-testid="bf-layer-custom">Some properties differ from the {layer.lithology === 'mixed' ? 'mixture' : `${layer.lithology} library`} ({Number(libT.conductivity.toFixed(2))} W/(m K), {(libT.radiogenic * 1e6).toFixed(1)} microW/m3, porosity {Number(libC.phi0.toFixed(3))} with {(libC.c * 1000).toFixed(2)}/km).</p>
      )}
      {stale && (
        <p className="text-[11px] text-pl-warning-text" data-testid="bf-layer-stale">
          These are {stale.from} values saved by an earlier release on a {layer.lithology} layer; the engine uses them as typed.
        </p>
      )}
    </div>
  );
}
