// Method-parameter dock (draft-then-Apply, the RockParamsPanel
// pattern — typing never recomputes the profile mid-keystroke).
// Water column / densities, NCT, Eaton vs Bowers with their
// parameters, Poisson's ratio, and manual calibration points as
// "depth, pressure" lines. PP0: the draft holds display units (depth,
// sonic and compaction follow the depth unit, densities the pressure
// unit); Apply converts back to the SI parameters.

import React, { useEffect, useState } from 'react';
import {
  DEFAULT_UNITS, depthToDisplay, depthFromDisplay, slownessToDisplay, slownessFromDisplay, slownessUnit,
  compactionToDisplay, compactionFromDisplay, compactionUnit, densityToDisplay, densityFromDisplay, densityUnit,
  densityDigits, pressureToDisplay, pressureFromDisplay, pressureDigits, stressUnit, emwReferenceDepthM, tidy,
} from '../services/units';

function Field({ id, label, value, onChange, step }) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-2 text-xs text-slate-400">
      <span>{label}</span>
      <input
        id={id}
        data-testid={id}
        type="number"
        step={step || 'any'}
        className="w-28 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200 text-right"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

const toDraft = (params, calibration, units) => {
  const zU = units.depth; const pU = units.pressure;
  const sMax = params.bowers?.sigmaMaxPa;
  return {
    waterDepthM: tidy(depthToDisplay(params.waterDepthM, zU), 2),
    rhoSeawaterKgM3: tidy(densityToDisplay(params.rhoSeawaterKgM3, pU), densityDigits(pU)),
    rhoFluidKgM3: tidy(densityToDisplay(params.rhoFluidKgM3, pU), densityDigits(pU)),
    mudlineMdM: tidy(depthToDisplay(params.mudlineMdM ?? 0, zU), 2),
    dtMlUsPerM: tidy(slownessToDisplay(params.nct.dtMlUsPerM, zU), 3),
    dtMaUsPerM: tidy(slownessToDisplay(params.nct.dtMaUsPerM, zU), 3),
    cPerM: tidy(compactionToDisplay(params.nct.cPerM, zU), 9),
    method: params.method,
    eatonN: String(params.eatonN),
    bowersA: String(params.bowers?.A ?? 10),
    bowersB: String(params.bowers?.B ?? 0.75),
    bowersU: params.bowers?.U != null ? String(params.bowers.U) : '',
    bowersSigmaMax: sMax != null ? tidy(pressureToDisplay(sMax, stressUnit(pU)), pressureDigits(stressUnit(pU))) : '',
    nu: String(params.nu),
    calText: (calibration || []).map((c) => {
      const ref = emwReferenceDepthM(c.z, params);
      return `${tidy(depthToDisplay(c.z, zU), 2)}, ${tidy(pressureToDisplay(c.pMpa * 1e6, pU, ref), pressureDigits(pU))}`;
    }).join('\n'),
  };
};

export default function ParamsPanel({ params, calibration, onApply, units = DEFAULT_UNITS }) {
  const zU = units.depth; const pU = units.pressure;
  const sU = slownessUnit(zU); const cU = compactionUnit(zU); const dU = densityUnit(pU); const stU = stressUnit(pU);
  const [d, setD] = useState(() => toDraft(params, calibration, units));
  useEffect(() => { setD(toDraft(params, calibration, units)); }, [params, calibration, units]);

  const set = (key) => (v) => setD((prev) => ({ ...prev, [key]: v }));

  const apply = () => {
    const num = (s) => Number(s);
    const bowers = { A: num(d.bowersA), B: num(d.bowersB) };
    if (d.bowersU !== '' && d.bowersSigmaMax !== '') {
      bowers.U = num(d.bowersU);
      bowers.sigmaMaxPa = pressureFromDisplay(num(d.bowersSigmaMax), stU);
    }
    const next = {
      waterDepthM: depthFromDisplay(num(d.waterDepthM), zU),
      rhoSeawaterKgM3: densityFromDisplay(num(d.rhoSeawaterKgM3), pU),
      rhoFluidKgM3: densityFromDisplay(num(d.rhoFluidKgM3), pU),
      mudlineMdM: depthFromDisplay(num(d.mudlineMdM), zU),
      nct: {
        dtMlUsPerM: slownessFromDisplay(num(d.dtMlUsPerM), zU),
        dtMaUsPerM: slownessFromDisplay(num(d.dtMaUsPerM), zU),
        cPerM: compactionFromDisplay(num(d.cPerM), zU),
      },
      method: d.method,
      eatonN: num(d.eatonN),
      bowers,
      nu: num(d.nu),
    };
    // calibration lines are "depth, pressure" in the display units; an
    // EMW pressure converts at that depth below the datum
    const cal = d.calText.split('\n').map((line) => line.trim()).filter(Boolean)
      .map((line) => {
        const [zd, pd] = line.split(',').map((s) => Number(s.trim()));
        const z = depthFromDisplay(zd, zU);
        const pa = pressureFromDisplay(pd, pU, emwReferenceDepthM(z, next));
        return { z, pMpa: pa / 1e6 };
      })
      .filter((c) => Number.isFinite(c.z) && Number.isFinite(c.pMpa));
    onApply({ params: next, calibration: cal });
  };

  return (
    <div className="p-3 flex flex-col gap-3 text-sm">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">Water column</div>
      <Field id="pp-param-wd" label={`Water depth (${zU})`} value={d.waterDepthM} onChange={set('waterDepthM')} />
      <Field id="pp-param-rhosw" label={`Seawater ρ (${dU})`} value={d.rhoSeawaterKgM3} onChange={set('rhoSeawaterKgM3')} />
      <Field id="pp-param-rhofl" label={`Pore fluid ρ (${dU})`} value={d.rhoFluidKgM3} onChange={set('rhoFluidKgM3')} />
      <Field id="pp-param-mudline" label={`Mudline at MD (${zU}, RKB)`} value={d.mudlineMdM} onChange={set('mudlineMdM')} />

      <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-1">Normal compaction trend</div>
      <Field id="pp-param-dtml" label={`dt mudline (${sU})`} value={d.dtMlUsPerM} onChange={set('dtMlUsPerM')} />
      <Field id="pp-param-dtma" label={`dt matrix (${sU})`} value={d.dtMaUsPerM} onChange={set('dtMaUsPerM')} />
      <Field id="pp-param-cnct" label={`c (${cU})`} value={d.cPerM} onChange={set('cPerM')} />

      <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-1">Method</div>
      <div className="flex gap-1">
        {['eaton', 'bowers'].map((m) => (
          <button
            key={m}
            type="button"
            data-testid={`pp-method-${m}`}
            className={`px-2 py-1 text-xs rounded border capitalize
              ${d.method === m ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
            onClick={() => setD((prev) => ({ ...prev, method: m }))}
          >
            {m}
          </button>
        ))}
      </div>
      {d.method === 'eaton' ? (
        <Field id="pp-param-eatonn" label="Eaton exponent n" value={d.eatonN} onChange={set('eatonN')} />
      ) : (
        <>
          <Field id="pp-param-bowersa" label="Bowers A (ft/s, psi)" value={d.bowersA} onChange={set('bowersA')} />
          <Field id="pp-param-bowersb" label="Bowers B" value={d.bowersB} onChange={set('bowersB')} />
          <Field id="pp-param-bowersu" label="U (empty = loading)" value={d.bowersU} onChange={set('bowersU')} />
          <Field id="pp-param-bowerssmax" label={`σ'max (${stU})`} value={d.bowersSigmaMax} onChange={set('bowersSigmaMax')} />
        </>
      )}
      <Field id="pp-param-nu" label="Poisson's ratio ν" value={d.nu} onChange={set('nu')} />

      <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-1">
        Calibration points (z {zU} bml, P {pU})
      </div>
      <textarea
        data-testid="pp-param-cal"
        rows={4}
        className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200 text-xs font-mono"
        placeholder={pU === 'MPa' && zU === 'm' ? '3000, 34.5\n3600, 45.2' : `depth ${zU}, pressure ${pU}`}
        value={d.calText}
        onChange={(e) => set('calText')(e.target.value)}
      />

      <button
        type="button"
        data-testid="pp-apply-params"
        className="mt-1 px-3 py-1.5 rounded border border-cyan-700 text-cyan-300 hover:bg-cyan-500/10 text-xs"
        onClick={apply}
      >
        Apply
      </button>
    </div>
  );
}
