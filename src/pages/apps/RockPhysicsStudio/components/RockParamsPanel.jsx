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
import { convert, M_PER_FT } from '@/lib/units/registry';
import { FLUID_MIXING } from '../services/scenario';

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

function FluidSide({ side, label, draft, setDraft, gorUnit, onGorUnit, wellInputs = null, depthUnit = 'm' }) {
  const d = draft[side];
  const patch = (p) => setDraft({ ...draft, [side]: { ...d, ...p } });
  const patchHc = (p) => patch({ hc: { ...d.hc, ...p } });
  return (
    <div className="mt-2">
      <div className="text-[11px] uppercase tracking-wider text-pl-muted">{label}</div>
      <Field id={`${side}-sw`} label="Water saturation Sw" value={d.sw} onChange={(v) => patch({ sw: v })} unit="v/v" />
      {side === 'fluidB' && (
        <>
          <Check2
            id="fluidB-shm"
            label="Sw from saturation-height"
            checked={d.shm?.on}
            onChange={(v) => patch({ shm: { ...(d.shm || {}), on: v, projectId: d.shm?.projectId || wellInputs?.scalProjects?.[0]?.id || '' } })}
            title="Per sample, fluid B is brine and the hydrocarbon at the Sw a SCAL Studio saturation-height function gives for the sample's height above the free-water level (through Petrophysics Studio's reader). Move the free-water level to ask what the logs would look like with the contact elsewhere. The typed Sw stands in where the function has no value."
          />
          {d.shm?.on && (
            <>
              <label className="flex items-center justify-between gap-2 py-0.5 text-[12px] text-pl-text">
                <span>SCAL Studio project</span>
                <select
                  data-testid="rp-param-fluidB-shm-project"
                  value={d.shm?.projectId || ''}
                  onChange={(e) => patch({ shm: { ...d.shm, projectId: e.target.value } })}
                  className="w-32 bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-pl-text"
                >
                  {!(wellInputs?.scalProjects || []).length && <option value="">none saved</option>}
                  {(wellInputs?.scalProjects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="flex items-center justify-between gap-2 py-0.5 text-[12px] text-pl-text" title="Free-water level, true vertical depth subsea. Blank uses the level saved in the SCAL Studio project.">
                <span>Free-water level (TVDSS)</span>
                <span className="flex items-center gap-1">
                  <input
                    data-testid="rp-param-fluidB-shm-fwl"
                    type="text"
                    inputMode="decimal"
                    value={d.shm?.fwlDisplay ?? ''}
                    placeholder="project"
                    onChange={(e) => patch({ shm: { ...d.shm, fwlDisplay: e.target.value } })}
                    className="w-20 bg-pl-surface border border-pl-border-strong rounded px-1.5 py-0.5 text-right text-pl-text focus:outline-none focus:border-pl-focus"
                  />
                  <span className="w-16 text-[11px] text-pl-muted">{depthUnit}</span>
                </span>
              </label>
              {wellInputs?.shm && (
                <p className={`pb-0.5 text-[11px] ${wellInputs.shm.ok ? 'text-pl-muted' : 'text-pl-warning-text'}`} data-testid="rp-param-fluidB-shm-note">
                  {wellInputs.shm.text}
                </p>
              )}
            </>
          )}
        </>
      )}
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
export default function RockParamsPanel({ scenario, rock, onApply, units = {}, onUnit = null, wellInputs = null }) {
  const [salUnit, setSalUnit] = useState('frac');
  const u = useMemo(() => ({
    temperature: TEMPERATURE_UNITS.includes(units.temperature) ? units.temperature : 'degC',
    pressure: PRESSURE_UNITS.includes(units.pressure) ? units.pressure : 'MPa',
    gor: GOR_UNITS.includes(units.gor) ? units.gor : 'm3/m3',
    salinity: salUnit,
  }), [units.temperature, units.pressure, units.gor, salUnit]);
  const setUnit = (key, value) => { if (key === 'salinity') setSalUnit(value); else onUnit?.(key, value); };

  const zU = units.depth === 'ft' ? 'ft' : 'm';
  const toDraft = () => {
    const side = (s) => ({
      ...s,
      hc: { ...s.hc, ...(s.hc.kind === 'oil-live' ? { gorDisplay: gorToDisplay(s.hc.gorLL ?? 100, u.gor) } : {}) },
      ...(s.shm ? { shm: { ...s.shm, fwlDisplay: Number.isFinite(s.shm.fwlTvdssM) ? tidy(zU === 'ft' ? s.shm.fwlTvdssM / M_PER_FT : s.shm.fwlTvdssM, 2) : '' } } : {}),
    });
    return {
      ...scenario,
      // U2-011: where the pore pressure came from rides with the number
      conditions: { ...condToDisplay(scenario.conditions, u), pSource: scenario.conditions.pSource || null },
      fluidA: side(scenario.fluidA),
      fluidB: side(scenario.fluidB),
      rock,
    };
  };
  const [draft, setDraft] = useState(toDraft);
  const [note, setNote] = useState('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(toDraft()); }, [scenario, rock, u, zU]);

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
      ...(name === 'B' && s.shm ? {
        shm: {
          on: !!s.shm.on,
          projectId: s.shm.projectId || '',
          fwlTvdssM: Number.isFinite(parseFloat(s.shm.fwlDisplay)) ? parseFloat(s.shm.fwlDisplay) * (zU === 'ft' ? M_PER_FT : 1) : null,
        },
      } : {}),
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
      ...(draft.conditions.pSource ? { pSource: draft.conditions.pSource } : {}),
    };
    onApply({
      scenario: {
        mixing: draft.mixing === 'voigt' ? 'voigt' : 'wood',
        conditions,
        fluidA: parseSide(draft.fluidA, 'A'),
        fluidB: parseSide(draft.fluidB, 'B'),
      },
      rock: {
        // fields this panel does not edit (the pseudo-sonic setting, the mineral
        // source) ride through an Apply untouched
        ...rock,
        minerals: Object.fromEntries(
          Object.entries(draft.rock.minerals).map(([k, v]) => [k, num(v, 0)]),
        ),
        kminOverrideGPa: draft.rock.kminOverrideGPa,
        phiConst: take(draft.rock.phiConst, 0.2, 'porosity constant'),
        clayFromVsh: !!draft.rock.clayFromVsh,
        mineralsFromPetro: !!draft.rock.mineralsFromPetro,
        iterativeVs: draft.rock.iterativeVs !== false,
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
      <Field id="pMPa" label="Pore pressure" value={draft.conditions.pMPa} onChange={(v) => patchCond({ pMPa: v, pSource: null })} unit={u.pressure} units={PRESSURE_UNITS} onUnit={(v) => setUnit('pressure', v)} title="Pore (fluid) pressure for Batzle-Wang, absolute" />
      {wellInputs?.pp && (wellInputs.pp.ok ? (
        <div className="flex items-center justify-between gap-2 pb-0.5 text-[11px] text-pl-muted">
          <span data-testid="rp-param-pp-note">{draft.conditions.pSource ? `From ${draft.conditions.pSource}.` : 'This well has a pore pressure curve.'}</span>
          <button
            type="button"
            data-testid="rp-param-pp-use"
            title={`${wellInputs.pp.source}. Fills the pore pressure; press Apply to use it.`}
            className="shrink-0 px-1.5 py-0.5 rounded border border-pl-border-strong text-pl-text hover:bg-pl-sunken"
            onClick={() => patchCond({ pMPa: tidy(convert('pressure', wellInputs.pp.mpa, 'MPa', u.pressure), 4), pSource: wellInputs.pp.source })}
          >
            Use {tidy(convert('pressure', wellInputs.pp.mpa, 'MPa', u.pressure), 2)} {u.pressure}
          </button>
        </div>
      ) : (
        <p className="pb-0.5 text-[11px] text-pl-muted" data-testid="rp-param-pp-note">{wellInputs.pp.reason}</p>
      ))}
      <Field id="salinity" label="Salinity (NaCl)" value={draft.conditions.salinity} onChange={(v) => patchCond({ salinity: v })} unit={u.salinity} units={SALINITY_UNITS} onUnit={(v) => setUnit('salinity', v)} />

      <label className="flex items-center justify-between gap-2 py-0.5 text-[12px] text-pl-text" title="How brine and hydrocarbon share the pores when Sw is between 0 and 1. Uniform: a fine mix, the Wood (Reuss) average of the fluid moduli, the soft bound. Patchy: the phases in patches, at the stiff bound, the Voigt average. A real rock lies between the two; a little gas softens a uniform mix far more than a patchy one.">
        <span>Fluid mixing</span>
        <select
          data-testid="rp-param-mixing"
          value={draft.mixing === 'voigt' ? 'voigt' : 'wood'}
          onChange={(e) => setDraft({ ...draft, mixing: e.target.value })}
          className="w-36 bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-pl-text"
        >
          {FLUID_MIXING.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </label>

      <FluidSide side="fluidA" label="Fluid A (in situ)" draft={draft} setDraft={setDraft} gorUnit={u.gor} onGorUnit={(v) => setUnit('gor', v)} />
      <FluidSide side="fluidB" label="Fluid B (substitute)" draft={draft} setDraft={setDraft} gorUnit={u.gor} onGorUnit={(v) => setUnit('gor', v)} wellInputs={wellInputs} depthUnit={zU} />

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
      <Check2
        id="mineralsFromPetro"
        label="Minerals from Petrophysics (per sample)"
        checked={draft.rock.mineralsFromPetro}
        onChange={(v) => patchRock({ mineralsFromPetro: v })}
        title="K_min at each sample is the Voigt-Reuss-Hill mix of the mineral fractions Petrophysics Studio's mineral model published on this well (their share of the solid). The K_min override wins; samples with no fractions use the mineral table above."
      />
      {wellInputs && (
        <p className="pb-0.5 text-[11px] text-pl-muted" data-testid="rp-param-minerals-note">
          {wellInputs.minerals?.keys?.length && !wellInputs.minerals.unknown.length
            ? `This well has a published mineral model: ${wellInputs.minerals.keys.join(', ')}.`
            : wellInputs.minerals?.unknown?.length
              ? `This well's mineral model holds ${wellInputs.minerals.unknown.join(', ')}, which Rock Physics has no modulus for; the table is used.`
              : 'This well has no published mineral model (run and publish one in Petrophysics Studio); the table is used.'}
        </p>
      )}
      <Check2
        id="iterativeVs"
        label="Iterative Vs in hydrocarbon rock"
        checked={draft.rock.iterativeVs !== false}
        onChange={(v) => patchRock({ iterativeVs: v })}
        title="Only used when the well has no shear log. Greenberg-Castagna is a brine-rock regression: where a sample holds hydrocarbon, Vs is found by taking the rock to brine, applying the regression and coming back, repeated until it settles. Off applies the regression straight to the in-situ Vp, which reads low in gas."
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
