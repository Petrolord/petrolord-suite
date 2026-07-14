// Dock parameter panel (G6.4): reservoir conditions, the two pore
// fluids (Batzle-Wang inputs, Wood-mixed at Sw), and the rock model
// (mineral fractions + K_min override). Draft-and-Apply like the
// Petrophysics ParameterPanel so half-typed numbers never reach the
// engine (which throws on unphysical inputs by design).

import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

const num = (v, fallback) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : fallback;
};

function Field({ id, label, value, onChange, step = 'any' }) {
  return (
    <label className="flex items-center justify-between gap-2 py-0.5 text-[12px] text-slate-300">
      <span>{label}</span>
      <input
        data-testid={`rp-param-${id}`}
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-right
          text-slate-100 focus:outline-none focus:border-cyan-600"
      />
    </label>
  );
}

function FluidSide({ side, label, draft, setDraft }) {
  const d = draft[side];
  const patch = (p) => setDraft({ ...draft, [side]: { ...d, ...p } });
  const patchHc = (p) => patch({ hc: { ...d.hc, ...p } });
  return (
    <div className="mt-2">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <Field id={`${side}-sw`} label="Water saturation Sw" value={d.sw} onChange={(v) => patch({ sw: v })} />
      <label className="flex items-center justify-between gap-2 py-0.5 text-[12px] text-slate-300">
        <span>Hydrocarbon</span>
        <select
          data-testid={`rp-param-${side}-kind`}
          value={d.hc.kind}
          onChange={(e) => patchHc({ kind: e.target.value })}
          className="w-24 bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-slate-100"
        >
          <option value="gas">gas</option>
          <option value="oil-dead">dead oil</option>
          <option value="oil-live">live oil</option>
        </select>
      </label>
      {d.hc.kind === 'gas' && (
        <Field id={`${side}-gravity`} label="Gas gravity" value={d.hc.gravity} onChange={(v) => patchHc({ gravity: v })} />
      )}
      {d.hc.kind !== 'gas' && (
        <Field id={`${side}-api`} label="Oil API" value={d.hc.api ?? 35} onChange={(v) => patchHc({ api: v })} />
      )}
      {d.hc.kind === 'oil-live' && (
        <>
          <Field id={`${side}-gor`} label="GOR (L/L)" value={d.hc.gorLL ?? 100} onChange={(v) => patchHc({ gorLL: v })} />
          <Field id={`${side}-gg`} label="Solution gas gravity" value={d.hc.gasGravity ?? 0.7} onChange={(v) => patchHc({ gasGravity: v })} />
        </>
      )}
    </div>
  );
}

export default function RockParamsPanel({ scenario, rock, onApply }) {
  const [draft, setDraft] = useState({ ...scenario, rock });
  useEffect(() => { setDraft({ ...scenario, rock }); }, [scenario, rock]);

  const patchCond = (p) => setDraft({ ...draft, conditions: { ...draft.conditions, ...p } });
  const patchRock = (p) => setDraft({ ...draft, rock: { ...draft.rock, ...p } });
  const patchMin = (p) => patchRock({ minerals: { ...draft.rock.minerals, ...p } });

  const apply = () => {
    const c = draft.conditions;
    const parseSide = (s) => ({
      sw: num(s.sw, 1),
      hc: {
        kind: s.hc.kind,
        ...(s.hc.kind === 'gas'
          ? { gravity: num(s.hc.gravity, 0.6) }
          : {
            api: num(s.hc.api, 35),
            ...(s.hc.kind === 'oil-live'
              ? { gorLL: num(s.hc.gorLL, 100), gasGravity: num(s.hc.gasGravity, 0.7) }
              : {}),
          }),
      },
    });
    onApply({
      scenario: {
        conditions: { tC: num(c.tC, 60), pMPa: num(c.pMPa, 25), salinity: num(c.salinity, 0.035) },
        fluidA: parseSide(draft.fluidA),
        fluidB: parseSide(draft.fluidB),
      },
      rock: {
        minerals: Object.fromEntries(
          Object.entries(draft.rock.minerals).map(([k, v]) => [k, num(v, 0)]),
        ),
        kminOverrideGPa: draft.rock.kminOverrideGPa,
        phiConst: num(draft.rock.phiConst, 0.2),
      },
    });
  };

  return (
    <div className="p-3 border-b border-slate-800/60" data-testid="rp-params">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">Reservoir conditions</div>
      <Field id="tC" label="Temperature (°C)" value={draft.conditions.tC} onChange={(v) => patchCond({ tC: v })} />
      <Field id="pMPa" label="Pressure (MPa)" value={draft.conditions.pMPa} onChange={(v) => patchCond({ pMPa: v })} />
      <Field id="salinity" label="Salinity (wt frac NaCl)" value={draft.conditions.salinity} onChange={(v) => patchCond({ salinity: v })} />

      <FluidSide side="fluidA" label="Fluid A (in situ)" draft={draft} setDraft={setDraft} />
      <FluidSide side="fluidB" label="Fluid B (substitute)" draft={draft} setDraft={setDraft} />

      <div className="mt-2 text-[11px] uppercase tracking-wider text-slate-500">Rock model</div>
      {Object.keys(draft.rock.minerals).map((m) => (
        <Field
          key={m}
          id={`min-${m}`}
          label={`${m} fraction`}
          value={draft.rock.minerals[m]}
          onChange={(v) => patchMin({ [m]: v })}
        />
      ))}
      <label className="flex items-center justify-between gap-2 py-0.5 text-[12px] text-slate-300">
        <span title="Blank = Voigt-Reuss-Hill mix of the mineral table">K_min override (GPa)</span>
        <input
          data-testid="rp-param-kmin"
          type="text"
          value={draft.rock.kminOverrideGPa}
          placeholder="VRH mix"
          onChange={(e) => patchRock({ kminOverrideGPa: e.target.value })}
          className="w-24 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-right
            text-slate-100 focus:outline-none focus:border-cyan-600"
        />
      </label>
      <Field id="phiConst" label="φ if no PHIE curve" value={draft.rock.phiConst} onChange={(v) => patchRock({ phiConst: v })} />

      <button
        type="button"
        data-testid="rp-apply-params"
        className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1 text-xs rounded border
          border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10"
        onClick={apply}
      >
        <Check className="w-3.5 h-3.5" /> Apply
      </button>
    </div>
  );
}
