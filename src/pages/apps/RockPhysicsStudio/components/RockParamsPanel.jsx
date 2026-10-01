// Dock parameter panel (G6.4): reservoir conditions, the two pore
// fluids (Batzle-Wang inputs, Wood-mixed at Sw), and the rock model
// (mineral fractions + K_min override). Draft-and-Apply like the
// Petrophysics ParameterPanel so half-typed numbers never reach the
// engine (which throws on unphysical inputs by design).
//
// AppUpgrade RP-U1 (2026-10-01):
// - 008: temperature, pore pressure and GOR are typed in the Suite unit
//   profile's units (degC or degF, MPa, bar, kPa or psi, m3/m3 or scf/STB)
//   and salinity as a fraction, ppm or wt%; every value is converted at
//   the door and the scenario stays SI (degC, MPa, weight fraction, L/L).
// - 004/005/006: clay from VSH, fluid A's Sw from the SW log, and the
//   Gassmann limits (VSH and porosity) are set here.
// - A blank field no longer silently takes a default: Apply says which
//   fields it filled.

import React, { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { convert } from '@/lib/units/registry';

const num = (v, fallback) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : fallback;
};

export const TEMPERATURE_UNITS = ['degC', 'degF'];
export const PRESSURE_UNITS = ['MPa', 'bar', 'kPa', 'psi'];
export const GOR_UNITS = ['m3/m3', 'scf/STB'];
export const SALINITY_UNITS = [
  { key: 'frac', label: 'weight fraction', factor: 1 },
  { key: 'ppm', label: 'ppm NaCl', factor: 1e-6 },
  { key: 'pct', label: 'wt% NaCl', factor: 0.01 },
];
const SAL = Object.fromEntries(SALINITY_UNITS.map((u) => [u.key, u]));
const tidy = (v, d = 6) => (Number.isFinite(v) ? String(Number(v.toFixed(d))) : '');

/** Display text <-> SI (the scenario's units). Pure, exported for tests. */
export const condToDisplay = (cond, u) => ({
  tC: tidy(convert('temperature', Number(cond.tC), 'degC', u.temperature), 3),
  pMPa: tidy(convert('pressure', Number(cond.pMPa), 'MPa', u.pressure), 4),
  salinity: tidy(Number(cond.salinity) / SAL[u.salinity || 'frac'].factor, 6),
});
export const condFromDisplay = (d, u) => ({
  tC: convert('temperature', parseFloat(d.tC), u.temperature, 'degC'),
  pMPa: convert('pressure', parseFloat(d.pMPa), u.pressure, 'MPa'),
  salinity: parseFloat(d.salinity) * SAL[u.salinity || 'frac'].factor,
});
// GOR: the engine takes L/L, which is m3/m3
export const gorToDisplay = (gorLL, unit) => tidy(convert('gor', Number(gorLL), 'm3/m3', unit), 3);
export const gorFromDisplay = (v, unit) => convert('gor', parseFloat(v), unit, 'm3/m3');

function Field({ id, label, value, onChange, step = 'any', unit = null, units = null, onUnit = null, title }) {
  return (
    <label className="flex items-center justify-between gap-2 py-0.5 text-[12px] text-pl-text" title={title}>
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input
          data-testid={`rp-param-${id}`}
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-20 bg-pl-surface border border-pl-border-strong rounded px-1.5 py-0.5 text-right
            text-pl-text focus:outline-none focus:border-pl-focus"
        />
        {units ? (
          <select
            data-testid={`rp-param-${id}-unit`}
            value={unit}
            onChange={(e) => onUnit(e.target.value)}
            className="w-16 bg-pl-surface border border-pl-border-strong rounded px-0.5 py-0.5 text-[11px] text-pl-text"
          >
            {units.map((o) => (typeof o === 'string'
              ? <option key={o} value={o}>{o}</option>
              : <option key={o.key} value={o.key}>{o.label}</option>))}
          </select>
        ) : unit ? <span className="w-16 text-[11px] text-pl-muted">{unit}</span> : null}
      </span>
    </label>
  );
}

function Check2({ id, label, checked, onChange, title }) {
  return (
    <label className="flex items-center justify-between gap-2 py-0.5 text-[12px] text-pl-text" title={title}>
      <span>{label}</span>
      <input data-testid={`rp-param-${id}`} type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} className="accent-pl-primary" />
    </label>
  );
}

function FluidSide({ side, label, draft, setDraft, gorUnit, onGorUnit }) {
  const d = draft[side];
  const patch = (p) => setDraft({ ...draft, [side]: { ...d, ...p } });
  const patchHc = (p) => patch({ hc: { ...d.hc, ...p } });
  return (
    <div className="mt-2">
      <div className="text-[11px] uppercase tracking-wider text-pl-muted">{label}</div>
      <Field id={`${side}-sw`} label="Water saturation Sw" value={d.sw} onChange={(v) => patch({ sw: v })} unit="v/v" />
      {side === 'fluidA' && (
        <Check2
          id="fluidA-swlog"
          label="Sw from the SW log"
          checked={d.swFromLog}
          onChange={(v) => patch({ swFromLog: v })}
          title="Per sample, fluid A is brine and the hydrocarbon at the well's SW log; the typed Sw stands in where the log is absent or null"
        />
      )}
      <label className="flex items-center justify-between gap-2 py-0.5 text-[12px] text-pl-text">
        <span>Hydrocarbon</span>
        <select
          data-testid={`rp-param-${side}-kind`}
          value={d.hc.kind}
          onChange={(e) => patchHc({ kind: e.target.value })}
          className="w-24 bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-pl-text"
        >
          <option value="gas">gas</option>
          <option value="oil-dead">dead oil</option>
          <option value="oil-live">live oil</option>
        </select>
      </label>
      {d.hc.kind === 'gas' && (
        <Field id={`${side}-gravity`} label="Gas gravity" value={d.hc.gravity} onChange={(v) => patchHc({ gravity: v })} unit="air = 1" />
      )}
      {d.hc.kind !== 'gas' && (
        <Field id={`${side}-api`} label="Oil API" value={d.hc.api ?? 35} onChange={(v) => patchHc({ api: v })} unit="°API" />
      )}
      {d.hc.kind === 'oil-live' && (
        <>
          <Field id={`${side}-gor`} label="GOR" value={d.hc.gorDisplay ?? ''} onChange={(v) => patchHc({ gorDisplay: v })} unit={gorUnit} units={GOR_UNITS} onUnit={onGorUnit} />
          <Field id={`${side}-gg`} label="Solution gas gravity" value={d.hc.gasGravity ?? 0.7} onChange={(v) => patchHc({ gasGravity: v })} unit="air = 1" />
        </>
      )}
    </div>
  );
}

/**
 * @param {{temperature?: string, pressure?: string, gor?: string}} [p.units] profile units for the conditions
 * @param {(key: string, unit: string) => void} [p.onUnit] change one of them for the session
 */
export default function RockParamsPanel({ scenario, rock, onApply, units = {}, onUnit = null }) {
  const [salUnit, setSalUnit] = useState('frac');
  const u = useMemo(() => ({
    temperature: TEMPERATURE_UNITS.includes(units.temperature) ? units.temperature : 'degC',
    pressure: PRESSURE_UNITS.includes(units.pressure) ? units.pressure : 'MPa',
    gor: GOR_UNITS.includes(units.gor) ? units.gor : 'm3/m3',
    salinity: salUnit,
  }), [units.temperature, units.pressure, units.gor, salUnit]);
  const setUnit = (key, value) => { if (key === 'salinity') setSalUnit(value); else onUnit?.(key, value); };

  const toDraft = () => {
    const side = (s) => ({ ...s, hc: { ...s.hc, ...(s.hc.kind === 'oil-live' ? { gorDisplay: gorToDisplay(s.hc.gorLL ?? 100, u.gor) } : {}) } });
    return {
      ...scenario,
      conditions: condToDisplay(scenario.conditions, u),
      fluidA: side(scenario.fluidA),
      fluidB: side(scenario.fluidB),
      rock,
    };
  };
  const [draft, setDraft] = useState(toDraft);
  const [note, setNote] = useState('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(toDraft()); }, [scenario, rock, u]);

  const patchCond = (p) => setDraft({ ...draft, conditions: { ...draft.conditions, ...p } });
  const patchRock = (p) => setDraft({ ...draft, rock: { ...draft.rock, ...p } });
  const patchMin = (p) => patchRock({ minerals: { ...draft.rock.minerals, ...p } });

  const apply = () => {
    const filled = [];
    const take = (v, fallback, name) => {
      const x = parseFloat(v);
      if (Number.isFinite(x)) return x;
      filled.push(name);
      return fallback;
    };
    const c = condFromDisplay(draft.conditions, u);
    const parseSide = (s, name) => ({
      sw: take(s.sw, name === 'A' ? 1 : 0, `Sw ${name}`),
      ...(name === 'A' ? { swFromLog: !!s.swFromLog } : {}),
      hc: {
        kind: s.hc.kind,
        ...(s.hc.kind === 'gas'
          ? { gravity: take(s.hc.gravity, 0.6, `gas gravity ${name}`) }
          : {
            api: take(s.hc.api, 35, `API ${name}`),
            ...(s.hc.kind === 'oil-live'
              ? {
                gorLL: Number.isFinite(gorFromDisplay(s.hc.gorDisplay, u.gor)) ? gorFromDisplay(s.hc.gorDisplay, u.gor) : take('', 100, `GOR ${name}`),
                gasGravity: take(s.hc.gasGravity, 0.7, `solution gas gravity ${name}`),
              }
              : {}),
          }),
      },
    });
    const conditions = {
      tC: Number.isFinite(c.tC) ? c.tC : take('', 60, 'temperature'),
      pMPa: Number.isFinite(c.pMPa) ? c.pMPa : take('', 25, 'pressure'),
      salinity: Number.isFinite(c.salinity) ? c.salinity : take('', 0.035, 'salinity'),
    };
    onApply({
      scenario: {
        conditions,
        fluidA: parseSide(draft.fluidA, 'A'),
        fluidB: parseSide(draft.fluidB, 'B'),
      },
      rock: {
        minerals: Object.fromEntries(
          Object.entries(draft.rock.minerals).map(([k, v]) => [k, num(v, 0)]),
        ),
        kminOverrideGPa: draft.rock.kminOverrideGPa,
        phiConst: take(draft.rock.phiConst, 0.2, 'porosity constant'),
        clayFromVsh: !!draft.rock.clayFromVsh,
        vshMax: take(draft.rock.vshMax, 0.5, 'VSH limit'),
        phiMin: take(draft.rock.phiMin, 0.03, 'porosity limit'),
      },
    });
    setNote(filled.length ? `Blank, so the default was used: ${filled.join(', ')}.` : '');
  };

  return (
    <div className="p-3 border-b border-pl-border" data-testid="rp-params">
      <div className="text-[11px] uppercase tracking-wider text-pl-muted">Reservoir conditions</div>
      <Field id="tC" label="Temperature" value={draft.conditions.tC} onChange={(v) => patchCond({ tC: v })} unit={u.temperature} units={TEMPERATURE_UNITS} onUnit={(v) => setUnit('temperature', v)} />
      <Field id="pMPa" label="Pore pressure" value={draft.conditions.pMPa} onChange={(v) => patchCond({ pMPa: v })} unit={u.pressure} units={PRESSURE_UNITS} onUnit={(v) => setUnit('pressure', v)} title="Pore (fluid) pressure for Batzle-Wang, absolute" />
      <Field id="salinity" label="Salinity (NaCl)" value={draft.conditions.salinity} onChange={(v) => patchCond({ salinity: v })} unit={u.salinity} units={SALINITY_UNITS} onUnit={(v) => setUnit('salinity', v)} />

      <FluidSide side="fluidA" label="Fluid A (in situ)" draft={draft} setDraft={setDraft} gorUnit={u.gor} onGorUnit={(v) => setUnit('gor', v)} />
      <FluidSide side="fluidB" label="Fluid B (substitute)" draft={draft} setDraft={setDraft} gorUnit={u.gor} onGorUnit={(v) => setUnit('gor', v)} />

      <div className="mt-2 text-[11px] uppercase tracking-wider text-pl-muted">Rock model</div>
      {Object.keys(draft.rock.minerals).map((m) => (
        <Field
          key={m}
          id={`min-${m}`}
          label={`${m} fraction`}
          value={draft.rock.minerals[m]}
          onChange={(v) => patchMin({ [m]: v })}
        />
      ))}
      <Check2
        id="clayFromVsh"
        label="Clay from VSH (per sample)"
        checked={draft.rock.clayFromVsh}
        onChange={(v) => patchRock({ clayFromVsh: v })}
        title="K_min mixes clay in at each sample's VSH (Voigt-Reuss-Hill with the other minerals in the table, rescaled). Use it with effective porosity, where the clay belongs to the solid."
      />
      <label className="flex items-center justify-between gap-2 py-0.5 text-[12px] text-pl-text">
        <span title="Blank = Voigt-Reuss-Hill mix of the mineral table">K_min override (GPa)</span>
        <input
          data-testid="rp-param-kmin"
          type="text"
          value={draft.rock.kminOverrideGPa}
          placeholder="VRH mix"
          onChange={(e) => patchRock({ kminOverrideGPa: e.target.value })}
          className="w-24 bg-pl-surface border border-pl-border-strong rounded px-1.5 py-0.5 text-right
            text-pl-text focus:outline-none focus:border-pl-focus"
        />
      </label>
      <Field id="phiConst" label="φ if no PHIE or PHIT" value={draft.rock.phiConst} onChange={(v) => patchRock({ phiConst: v })} unit="v/v" />
      <div className="mt-2 text-[11px] uppercase tracking-wider text-pl-muted" title="Gassmann holds for connected porosity; samples outside these limits keep their in-situ values and are counted">Gassmann limits</div>
      <Field id="vshMax" label="Substitute where VSH ≤" value={draft.rock.vshMax ?? 0.5} onChange={(v) => patchRock({ vshMax: v })} unit="v/v" />
      <Field id="phiMin" label="and porosity ≥" value={draft.rock.phiMin ?? 0.03} onChange={(v) => patchRock({ phiMin: v })} unit="v/v" />

      <button
        type="button"
        data-testid="rp-apply-params"
        className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1 text-xs rounded border
          border-pl-primary text-pl-primary-text hover:bg-pl-primary/10"
        onClick={apply}
      >
        <Check className="w-3.5 h-3.5" /> Apply
      </button>
      {note && <p className="mt-1 text-[11px] text-pl-warning-text" data-testid="rp-params-note">{note}</p>}
    </div>
  );
}
