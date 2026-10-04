/**
 * A starting deck for the Model Builder from a Waterflood Design Studio
 * pattern (SIM-U2-007, RL11). The pattern is read by id as its wf-forecast-1
 * contract (src/utils/waterflooddesign/wfForecastContract.js) with the saved
 * project's displacement inputs; the kr-1 and pvt-1 records the project
 * holds are taken by id too (the same intakes as the builder's cards), so
 * nothing is typed again.
 *
 * What the starting model is:
 *  - Grid: the quarter five-spot element of the pattern (a quarter of the
 *    pattern area, a square with the injector in one corner and the producer
 *    in the opposite corner), 11 x 11 x 1, the pattern's thickness and
 *    porosity. Line drives are not sent yet: refused with the reason.
 *  - Wells: the injector at a quarter of the pattern's injection rate (the
 *    contract's reservoir barrels, divided by Bw for the deck's surface
 *    rate); the producer on a liquid rate that balances it at the start
 *    (a quarter of the injection over Bo), with a BHP floor.
 *  - Fluids: pvt-1 from the Fluid Systems Studio project when the pattern
 *    holds one, the datum pressure the pressure Bo and Bw were read at;
 *    else the builder's correlation inputs and a stated datum pressure.
 *  - Relative permeability: kr-1 from the SCAL Studio project when the
 *    pattern holds one, else the pattern's own typed oil-water Corey set.
 *  - What the pattern does not hold (permeability, depth, the gas-oil set
 *    without kr-1) keeps the builder's value and is listed as such.
 *
 * Pure: the caller reads the blocks.
 */
import { defaultBuilderForm } from '@/utils/simDeckBuilder';
import { takeKrIntoForm, takePvtIntoForm } from './builderIntakes.js';
import { WF_FORECAST_SCHEMA } from '@/utils/waterflooddesign/wfForecastContract';

const N = 11;
const s = (v) => String(parseFloat(Number(v).toPrecision(8)));
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {{contract: object, payload: object, krBlock?: ?object, pvtBlock?: ?object, at?: string}} a
 *   `payload` the saved Waterflood project (inputs_data), for its typed displacement inputs
 * @param {object} [base] the builder form to start from (its identification and unit system are kept)
 * @returns {{ok: true, form: object, kept: string[], notes: string[]}|{ok: false, reason: string}}
 */
export function formFromWf({ contract, payload, krBlock = null, pvtBlock = null, at = new Date().toISOString() }, base = defaultBuilderForm()) {
  if (!contract || contract.schema !== WF_FORECAST_SCHEMA) return { ok: false, reason: 'Not a Waterflood Design Studio forecast.' };
  if (contract.model?.pattern && contract.model.pattern !== 'five-spot') {
    return { ok: false, reason: `The pattern is a ${contract.model.patternLabel || contract.model.pattern}: only a five-spot is sent as a starting deck yet (its quarter element). Build the line drive on the Builder tab.` };
  }
  const p = contract.inputs || {};
  if (![p.area_acres, p.h_ft, p.phi, p.iw_bpd, p.Bo, p.Bw].every((v) => finite(v) && v > 0)) return { ok: false, reason: 'The pattern lacks its area, thickness, porosity, injection rate, Bo or Bw.' };
  let form = structuredClone(base);
  const kept = [];
  const notes = [];
  // the quarter five-spot element: a quarter of the pattern area, square
  const side = Math.sqrt(p.area_acres * 43560) / 2;
  const dx = side / N;
  form.title = `${contract.source?.pattern || contract.projectName || 'Pattern'} waterflood`.slice(0, 60);
  form.startDate = contract.forecast?.start || form.startDate;
  form.grid = {
    ...form.grid, nx: String(N), ny: String(N), nz: '1', dx: s(dx), dy: s(dx),
    layers: [{ ...form.grid.layers[0], dz: s(p.h_ft), poro: s(p.phi) }],
  };
  form.structure = { ...form.structure, mode: 'uniform' };
  // permeability: the thickness-weighted mean of the pattern's layers (its Dykstra-Parsons input), when it has them
  const layers = (payload?.layers || []).map((l) => ({ h: Number(l.h), k: Number(l.k) })).filter((l) => l.h > 0 && l.k > 0);
  if (layers.length) {
    const kh = layers.reduce((a, l) => a + l.h * l.k, 0) / layers.reduce((a, l) => a + l.h, 0);
    form.grid.layers[0] = { ...form.grid.layers[0], permx: s(kh), permz: s(kh / 10) };
    notes.push(`Permeability ${s(kh)} mD: the thickness-weighted mean of the pattern's ${layers.length} layers; vertical a tenth of it (assumed)`);
  } else {
    kept.push(`permeability ${form.grid.layers[0].permx} mD horizontal and ${form.grid.layers[0].permz} mD vertical (the pattern holds none)`);
  }
  kept.push(`top depth ${form.grid.topsDepth} ft and the datum depth ${form.equil.datumDepth} ft (the pattern holds no depth)`);
  const qi = p.iw_bpd / 4;
  const prod = form.wells.find((w) => w.type === 'producer') || defaultBuilderForm().wells[0];
  const inj = form.wells.find((w) => w.type !== 'producer') || defaultBuilderForm().wells[1];
  form.wells = [
    { ...prod, name: 'PROD1', type: 'producer', i: String(N), j: String(N), k1: '1', k2: '1', refDepth: form.grid.topsDepth, mode: 'LRAT', rate: s(qi / p.Bo), bhp: prod.bhp || '500', trajectory: null },
    { ...inj, name: 'INJ1', type: 'water_injector', i: '1', j: '1', k1: '1', k2: '1', refDepth: form.grid.topsDepth, rate: s(qi / p.Bw), trajectory: null },
  ];
  notes.push(`Quarter five-spot element of the pattern: ${s(side)} ft square (a quarter of ${p.area_acres} acres), ${N} x ${N} cells; injector INJ1 at a quarter of the pattern's ${p.iw_bpd} RB/d (${s(qi / p.Bw)} STB/d at Bw ${p.Bw}); producer PROD1 on a liquid rate of ${s(qi / p.Bo)} STB/d that balances it at the start (Bo ${p.Bo})`);
  const years = Math.max(1, Math.ceil((contract.forecast?.elapsedDays || 365.25 * (p.maxYears || 10)) / 365.25));
  form.schedule = { ...form.schedule, years: String(years) };
  form.history = { ...form.history, enabled: false };
  form.equil = { ...form.equil, owc: '', goc: '' };
  if (p.Sgi > 0) notes.push(`The pattern starts with free gas (Sgi ${p.Sgi}); the deck starts with none (the fill-up is not modelled)`);
  // PVT: the pattern's Fluid Systems Studio project, or the builder's correlations
  if (pvtBlock) {
    const r = takePvtIntoForm(form, pvtBlock, { at });
    if (!r.ok) return { ok: false, reason: `The pattern's PVT project could not be taken: ${r.errors.join(' ')}` };
    form = r.form;
    if (finite(contract.sources?.pvt?.pressurePsia)) {
      form.equil = { ...form.equil, datumPressure: s(contract.sources.pvt.pressurePsia) };
      notes.push(`Datum pressure ${s(contract.sources.pvt.pressurePsia)} psia: the pressure the pattern read Bo and Bw at`);
    }
  } else {
    kept.push(`the black-oil correlation inputs and the datum pressure ${form.equil.datumPressure} psia (the pattern has no Fluid Systems Studio project; its Bo ${p.Bo} and Bw ${p.Bw} are typed there)`);
  }
  // kr: the pattern's SCAL Studio project, or its typed oil-water Corey set
  if (krBlock) {
    const r = takeKrIntoForm(form, krBlock, { at });
    if (!r.ok) return { ok: false, reason: `The pattern's SCAL project could not be taken: ${r.errors.join(' ')}` };
    form = r.form;
  } else {
    const d = payload?.displacementInputs || {};
    const ow = {};
    for (const k of ['Swc', 'Sor', 'krwMax', 'kroMax', 'nw', 'no']) if (String(d[k] ?? '').trim() !== '' && Number.isFinite(Number(d[k]))) ow[k] = String(d[k]);
    form.scal = { ...form.scal, ow: { ...form.scal.ow, ...ow } };
    form.krSource = { mode: 'typed', intake: null };
    kept.push('the gas-oil Corey set (the pattern holds an oil-water set only)');
  }
  form.origin = {
    app: 'Waterflood Design Studio', contract: WF_FORECAST_SCHEMA, recordId: contract.projectId, recordName: contract.projectName,
    pattern: contract.source?.pattern || null, fingerprint: contract.fingerprint, at, notes, kept,
  };
  form.identification = {
    ...(form.identification || {}),
    ...Object.fromEntries(['company', 'field', 'licence', 'reservoir'].map((k) => [k, form.identification?.[k] || contract.source?.[k] || ''])),
  };
  return { ok: true, form, kept, notes };
}

