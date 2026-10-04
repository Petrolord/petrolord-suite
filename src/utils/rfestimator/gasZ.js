/**
 * Gas z and Bgi from the canonical engines (RF-U2-003; closes RF-U1-020).
 *
 * zi at the initial pressure, za at the abandonment pressure and Bgi at the
 * initial pressure come from `gasZDetail` of the canonical engines library
 * (packages/engines/engines/fluid/blackOil.ts: Dranchuk-Abou-Kassem 1975 on
 * Sutton 1985 pseudo-criticals, gated there against Standing-Katz chart
 * readings) and `bgRbPerScf` (Bg = 0.005035 z T / p RB/scf, T in degR),
 * converted to ft3/scf on the Suite unit registry. Inputs: gas gravity (air
 * = 1), reservoir temperature (degF), pi and pa (psia).
 *
 * A case chooses its method (`inputs.zMethod`): 'dranchuk_abou_kassem'
 * (a new case) or 'typed' (zi, za and Bgi as typed or taken from a Fluid
 * Systems Studio project). A project saved before this round has no method
 * and keeps 'typed', so its numbers do not move; the page says so.
 *
 * Pure.
 */
import { gasZDetail, GAS_Z_METHODS, bgRbPerScf } from '../../../packages/engines/engines/fluid/blackOil';
import { convert } from '@/lib/units/registry';

export const Z_METHOD_DAK = 'dranchuk_abou_kassem';
export const Z_METHOD_TYPED = 'typed';
export const Z_METHODS = Object.freeze([Z_METHOD_DAK, Z_METHOD_TYPED]);
export const SUTTON_GRAVITY_RANGE = Object.freeze([0.57, 1.68]);
export const Z_REFERENCE = 'Dranchuk and Abou-Kassem (1975) on Sutton (1985) pseudo-critical properties, from the canonical engines library (gasZDetail); Bg = 0.005035 z T/p RB/scf';
export const Z_KEPT_NOTE = 'Saved before October 2026 with zi, za and Bgi typed: the project keeps them, so its numbers do not move. Choose Dranchuk-Abou-Kassem to compute them from the gas gravity and the temperature.';

const num = (v) => {
  if (v === '' || v == null) return NaN;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

export const zMethodLabel = (m) => (m === Z_METHOD_DAK ? `${GAS_Z_METHODS.dranchuk_abou_kassem.label} from gas gravity and temperature` : 'Typed (or taken from Fluid Systems Studio)');

/**
 * zi, za and Bgi of a gas case by Dranchuk-Abou-Kassem, or null when the case
 * is oil or its method is 'typed'.
 * @returns {?{ok: boolean, zi: ?object, za: ?object, bgi: ?number, flags: object[], errors: string[]}}
 */
export function rfGasZ(inputs) {
  if (inputs?.phase !== 'gas' || inputs?.zMethod !== Z_METHOD_DAK) return null;
  const c = inputs.corr || {};
  const sg = num(c.gasGravity); const t = num(c.tempF); const pi = num(c.pi); const pa = num(c.pa);
  const errors = [];
  if (!(sg > 0)) errors.push('Gas gravity is blank or not above zero, so z cannot be computed.');
  if (!Number.isFinite(t)) errors.push('Reservoir temperature is blank, so z cannot be computed.');
  else if (!(t + 459.67 > 0)) errors.push('Reservoir temperature is below absolute zero.');
  if (!(pi > 0)) errors.push('Initial pressure pi is blank or not above zero, so zi and Bgi cannot be computed.');
  if (errors.length) return { ok: false, zi: null, za: null, bgi: null, flags: errors.map((text) => ({ key: 'zMethod', scope: 'input', text })), errors };
  const at = (p) => {
    const d = gasZDetail(p, t, sg, Z_METHOD_DAK);
    return { p, z: d.z, ppr: d.ppr, tpr: d.tpr, ppc: d.ppc, tpc: d.tpc };
  };
  const zi = at(pi);
  const za = pa > 0 ? at(pa) : null;
  const bgi = convert('fvfGas', bgRbPerScf(pi, t, zi.z), 'RB/scf', 'rcf/scf');
  const flags = [];
  const m = GAS_Z_METHODS.dranchuk_abou_kassem;
  if (sg < SUTTON_GRAVITY_RANGE[0] || sg > SUTTON_GRAVITY_RANGE[1]) flags.push({ key: 'gasGravity', scope: 'input', text: `Gas gravity ${sg} is outside 0.57 to 1.68, the range the Sutton (1985) pseudo-criticals were fitted over.` });
  for (const [label, d] of [['pi', zi], ['pa', za]]) {
    if (!d) continue;
    if (d.tpr < m.chartTpr[0] || d.tpr > m.chartTpr[1]) flags.push({ key: 'tempF', scope: 'input', text: `At ${label} the reduced temperature Tpr ${d.tpr.toFixed(3)} is outside ${m.chartTpr[0]} to ${m.chartTpr[1]}, the window where the method was checked against the Standing-Katz chart. ${d.tpr < m.chartTpr[0] ? m.nearCritical : ''}`.trim() });
    if (d.ppr < m.chartPpr[0] || d.ppr > m.chartPpr[1]) flags.push({ key: label, scope: 'input', text: `At ${label} the reduced pressure Ppr ${d.ppr.toFixed(3)} is outside ${m.chartPpr[0]} to ${m.chartPpr[1]}, the window where the method was checked against the Standing-Katz chart.` });
  }
  return { ok: true, zi, za, bgi, flags, errors: [] };
}

/** The inputs the engine reads: the computed zi, za and Bgi in place of the typed ones. */
export function inputsWithGasZ(inputs, gz) {
  if (!gz?.ok) return inputs;
  return {
    ...inputs,
    corr: { ...inputs.corr, zi: String(gz.zi.z), ...(gz.za ? { za: String(gz.za.z) } : {}) },
    vol: { ...inputs.vol, bgi: String(gz.bgi) },
  };
}
