// Method-parameter dock (draft-then-Apply, the RockParamsPanel
// pattern — typing never recomputes the profile mid-keystroke).
// Water column / densities, NCT, Eaton vs Bowers with their
// parameters, Poisson's ratio, and manual calibration points as
// "depth, pressure MPa" lines.

import React, { useEffect, useState } from 'react';

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

const toDraft = (params, calibration) => ({
  waterDepthM: String(params.waterDepthM),
  rhoSeawaterKgM3: String(params.rhoSeawaterKgM3),
  rhoFluidKgM3: String(params.rhoFluidKgM3),
  mudlineMdM: String(params.mudlineMdM ?? 0),
  dtMlUsPerM: String(params.nct.dtMlUsPerM),
  dtMaUsPerM: String(params.nct.dtMaUsPerM),
  cPerM: String(params.nct.cPerM),
  method: params.method,
  eatonN: String(params.eatonN),
  bowersA: String(params.bowers?.A ?? 10),
  bowersB: String(params.bowers?.B ?? 0.75),
  bowersU: params.bowers?.U != null ? String(params.bowers.U) : '',
  bowersSigmaMaxMpa: params.bowers?.sigmaMaxPa != null ? String(params.bowers.sigmaMaxPa / 1e6) : '',
  nu: String(params.nu),
  calText: (calibration || []).map((c) => `${c.z}, ${c.pMpa}`).join('\n'),
});

export default function ParamsPanel({ params, calibration, onApply }) {
  const [d, setD] = useState(() => toDraft(params, calibration));
  useEffect(() => { setD(toDraft(params, calibration)); }, [params, calibration]);

  const set = (key) => (v) => setD((prev) => ({ ...prev, [key]: v }));

  const apply = () => {
    const num = (s) => Number(s);
    const bowers = { A: num(d.bowersA), B: num(d.bowersB) };
    if (d.bowersU !== '' && d.bowersSigmaMaxMpa !== '') {
      bowers.U = num(d.bowersU);
      bowers.sigmaMaxPa = num(d.bowersSigmaMaxMpa) * 1e6;
    }
    const cal = d.calText.split('\n').map((line) => line.trim()).filter(Boolean)
      .map((line) => {
        const [z, p] = line.split(',').map((s) => Number(s.trim()));
        return { z, pMpa: p };
      })
      .filter((c) => Number.isFinite(c.z) && Number.isFinite(c.pMpa));
    onApply({
      params: {
        waterDepthM: num(d.waterDepthM),
        rhoSeawaterKgM3: num(d.rhoSeawaterKgM3),
        rhoFluidKgM3: num(d.rhoFluidKgM3),
        mudlineMdM: num(d.mudlineMdM),
        nct: { dtMlUsPerM: num(d.dtMlUsPerM), dtMaUsPerM: num(d.dtMaUsPerM), cPerM: num(d.cPerM) },
        method: d.method,
        eatonN: num(d.eatonN),
        bowers,
        nu: num(d.nu),
      },
      calibration: cal,
    });
  };

  return (
    <div className="p-3 flex flex-col gap-3 text-sm">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">Water column</div>
      <Field id="pp-param-wd" label="Water depth (m)" value={d.waterDepthM} onChange={set('waterDepthM')} />
      <Field id="pp-param-rhosw" label="Seawater ρ (kg/m³)" value={d.rhoSeawaterKgM3} onChange={set('rhoSeawaterKgM3')} />
      <Field id="pp-param-rhofl" label="Pore fluid ρ (kg/m³)" value={d.rhoFluidKgM3} onChange={set('rhoFluidKgM3')} />
      <Field id="pp-param-mudline" label="Mudline at MD (m)" value={d.mudlineMdM} onChange={set('mudlineMdM')} />

      <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-1">Normal compaction trend</div>
      <Field id="pp-param-dtml" label="dt mudline (us/m)" value={d.dtMlUsPerM} onChange={set('dtMlUsPerM')} />
      <Field id="pp-param-dtma" label="dt matrix (us/m)" value={d.dtMaUsPerM} onChange={set('dtMaUsPerM')} />
      <Field id="pp-param-cnct" label="c (1/m)" value={d.cPerM} onChange={set('cPerM')} />

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
          <Field id="pp-param-bowerssmax" label="σ'max (MPa)" value={d.bowersSigmaMaxMpa} onChange={set('bowersSigmaMaxMpa')} />
        </>
      )}
      <Field id="pp-param-nu" label="Poisson's ratio ν" value={d.nu} onChange={set('nu')} />

      <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-1">
        Calibration points (z m bml, P MPa)
      </div>
      <textarea
        data-testid="pp-param-cal"
        rows={4}
        className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200 text-xs font-mono"
        placeholder={'3000, 34.5\n3600, 45.2'}
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
