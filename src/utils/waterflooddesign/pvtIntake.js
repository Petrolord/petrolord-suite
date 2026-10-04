/**
 * PVT from a Fluid Systems Studio project into Waterflood Design Studio
 * (WF-U1, reviewer lens RL11; plan Step 0c). The pvt-1 block of a saved
 * Fluid project is read by id (src/lib/pvtSource.js); at one stated
 * reservoir pressure (the bubble point when blank) its table gives:
 *
 *   Displacement   muO, muW              (cP)
 *   Pattern        Bo, Bw                (RB/STB)
 *   Surveillance   Bo, Bw (voidage), Bg (RB/Mscf), Rs (scf/STB)
 *
 * The block holds Bg in RB/scf; the voidage engine takes RB/Mscf, so the
 * value is converted through the unit registry (x 1,000). Values are read by
 * linear interpolation in the block's own table and never extrapolated.
 *
 * What is stored with the project (`pvtIntake`): the Fluid project, the time,
 * the pressure, the values taken, the method of each, and the block without
 * its table, so the shared PVT intake card can say "source changed since"
 * (content) and "edited after intake", and the report can print the source.
 *
 * Pure.
 */
import { convert } from '@/lib/units/registry';
import { pvtContractOf, pvtContractSummary, pvtContractSourceText, PVT_PRODUCER } from '@/lib/inputProvenance/pvtContract';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** The fields of the shared card, with where each lands in the studio. */
export const WF_PVT_FIELDS = Object.freeze([
  { key: 'muO', label: 'Oil viscosity muO (cP), Displacement', column: 'mu_o', method: 'mu_o', group: 'displacement', storeKey: 'muO' },
  { key: 'muW', label: 'Water viscosity muW (cP), Displacement', column: 'mu_w', method: 'mu_w', group: 'displacement', storeKey: 'muW' },
  { key: 'Bo', label: 'Bo (RB/STB), Pattern', column: 'Bo', method: 'bo', group: 'pattern', storeKey: 'Bo' },
  { key: 'Bw', label: 'Bw (RB/STB), Pattern', column: 'Bw', method: 'bw', group: 'pattern', storeKey: 'Bw' },
  { key: 'sBo', label: 'Bo (RB/STB), Surveillance voidage', column: 'Bo', method: 'bo', group: 'surveillance', storeKey: 'bo' },
  { key: 'sBw', label: 'Bw (RB/STB), Surveillance voidage', column: 'Bw', method: 'bw', group: 'surveillance', storeKey: 'bw' },
  { key: 'sBg', label: 'Bg (RB/Mscf), Surveillance voidage', column: 'Bg', method: 'bg', group: 'surveillance', storeKey: 'bg' },
  { key: 'sRs', label: 'Rs (scf/STB), Surveillance voidage', column: 'Rs', method: 'rs', group: 'surveillance', storeKey: 'rs' },
]);

/** Linear interpolation of a table column at a pressure; null outside the table. */
export function tableAt(rows, key, p) {
  const pts = (rows || []).filter((r) => finite(r.pressure) && finite(r[key])).sort((a, b) => a.pressure - b.pressure);
  if (!pts.length || p < pts[0].pressure - 1e-9 || p > pts[pts.length - 1].pressure + 1e-9) return null;
  for (let i = 1; i < pts.length; i += 1) {
    if (p <= pts[i].pressure) {
      const a = pts[i - 1];
      const b = pts[i];
      return a[key] + ((b[key] - a[key]) * (p - a.pressure)) / (b.pressure - a.pressure);
    }
  }
  return pts[pts.length - 1][key];
}

const g4 = (v) => String(parseFloat(Number(v).toPrecision(4)));

/**
 * @param {object} contract the pvt-1 block (with project_id and project_name)
 * @param {{pressurePsia?: ?number, at?: string}} [opts]
 * @returns {{ok: boolean, errors: string[], patch?: {displacement: object, pattern: object, surveillance: object}, intake?: object}}
 */
export function wfPvtIntake(contract, { pressurePsia = null, at: takenAt = new Date().toISOString() } = {}) {
  const b = pvtContractOf(contract);
  if (!b) return { ok: false, errors: ['No pvt-1 block: the Fluid Systems Studio project carries no PVT.'] };
  const stated = finite(pressurePsia);
  const pressure = stated ? pressurePsia : b.at_saturation?.pressure;
  if (!finite(pressure)) return { ok: false, errors: ['The block states no bubble point; state the reservoir pressure.'] };
  const table = b.table || [];
  const raw = {};
  const missing = [];
  for (const f of WF_PVT_FIELDS) {
    const v = tableAt(table, f.column, pressure);
    if (finite(v)) raw[f.key] = v; else missing.push(f.column);
  }
  const need = ['Bo', 'Bw', 'muO', 'muW'];
  if (need.some((k) => !finite(raw[k]))) {
    const ps = table.map((r) => r.pressure).filter(finite);
    return {
      ok: false,
      errors: [`The pressure ${g4(pressure)} psia is outside the PVT table of the project (${ps.length ? `${Math.min(...ps)} to ${Math.max(...ps)} psia` : 'no table'}), or the table lacks ${[...new Set(missing)].join(', ')} there. Values are not extrapolated.`],
    };
  }
  // RB/scf in the block to RB/Mscf for the voidage engine
  if (finite(raw.sBg)) raw.sBg = convert('fvfGas', raw.sBg, 'RB/scf', 'RB/Mscf');
  const values = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, g4(v)]));
  const pick = (group) => Object.fromEntries(WF_PVT_FIELDS.filter((f) => f.group === group && values[f.key] != null).map((f) => [f.storeKey, values[f.key]]));
  const where = stated ? `at ${g4(pressure)} psia (stated reservoir pressure)` : `at the bubble point, ${g4(pressure)} psia`;
  const methods = Object.fromEntries(WF_PVT_FIELDS.filter((f) => values[f.key] != null).map((f) => [f.key, pvtContractSourceText(b, f.method, { where })]));
  return {
    ok: true,
    errors: [],
    patch: { displacement: pick('displacement'), pattern: pick('pattern'), surveillance: pick('surveillance') },
    intake: {
      from: {
        app: b.source_app || PVT_PRODUCER, recordId: b.project_id ?? null, recordName: b.project_name ?? null,
        at: b.generated_at ?? null, takenAt, build: b.app_build ?? null, schema: b.schema,
      },
      pressure_psia: pressure,
      pressure_from: stated ? 'stated' : 'the bubble point of the block',
      values,
      fields: Object.keys(values),
      methods,
      contract: pvtContractSummary(b),
    },
  };
}

/** The current values of the studio by card key, for "edited after intake". */
export function wfPvtCurrent({ displacementInputs = {}, patternInputs = {}, surveillanceConfig = {} }) {
  return {
    muO: displacementInputs.muO, muW: displacementInputs.muW,
    Bo: patternInputs.Bo, Bw: patternInputs.Bw,
    sBo: surveillanceConfig.bo, sBw: surveillanceConfig.bw, sBg: surveillanceConfig.bg, sRs: surveillanceConfig.rs,
  };
}

/** Card fields with the method each was read with (the card prints it). */
export function wfPvtCardFields(intake) {
  return WF_PVT_FIELDS.map((f) => ({ key: f.key, label: f.label, method: intake?.methods?.[f.key] || undefined }));
}

/**
 * The Source column words of one studio input taken from the pvt-1 block,
 * or null when it was not taken; marks a value edited after the intake.
 * `key` is the card key (muO, Bo, sBg...), `now` the current stored value.
 */
export function wfPvtSourceText(intake, key, now) {
  if (!intake?.values?.[key]) return null;
  const base = intake.methods?.[key] || `From ${intake.from?.app || PVT_PRODUCER}`;
  const received = intake.values[key];
  if (now != null && String(now) !== '' && Number(now) !== Number(received)) {
    return `Edited in this app after the intake (received ${received}). The intake said: ${base}`;
  }
  return base;
}
