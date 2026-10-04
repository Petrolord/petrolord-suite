/**
 * The Model Builder's two intakes (SIM-U1; RL11, plan Step 0c): PVT from a
 * saved Fluid Systems Studio project (the pvt-1 block, read by id) and
 * relative permeability with capillary pressure from a saved SCAL Studio
 * project (the kr-1 block, read by id).
 *
 * PVT. The deck's PVTO, PVDG and PVTW are written from the block's own
 * table through Fluid Systems Studio's simulator export
 * (simRowsFromContract), so for the same fluid they are that export's rows;
 * nothing is recomputed here and no correlation is named that the block did
 * not name. The surface densities take the block's oil and gas gravity.
 * While a block is in use the typed fluid and water fields are shown as
 * received and are not used.
 *
 * kr. The oil-water and gas-oil Corey sets and the Leverett J with its rock
 * are copied into the form's SCAL fields, which stay editable; the shared
 * KrIntakeCard says "edited after intake" for a changed value. The deck's
 * SWOF and SGOF are then SCAL Studio's own export rows (satFnRows), with
 * Pcow from the J at each table Sw and the J's own Swirr.
 *
 * Both blocks are kept with the case's builder form, so a reload or a
 * colleague opening the case sees what the deck was built from, and the
 * cards can say "source changed since" by content.
 *
 * Pure.
 */
import { pvtContractOf, validatePvtContract, PVT_PRODUCER, pvtContractCsvHeader } from '@/lib/inputProvenance/pvtContract';
import { krContractOf, validateKrContract, KR_PRODUCER, describeKrContract } from '@/lib/inputProvenance/krContract';
import { krIntakeRecord } from '@/lib/inputProvenance/krIntakeCard';
import { simRowsFromContract } from '@/utils/fluidstudio/simKeywords';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
// full precision: the form keeps what the block sent, so the deck's rows are the producer's own
const s = (v) => (finite(v) ? String(v) : '');

/** The fields of the shared PVT intake card in the builder. */
export const SIM_PVT_FIELDS = Object.freeze([
  { property: 'oil_gravity', key: 'api', label: 'Oil gravity (degAPI)' },
  { property: 'gas_gravity', key: 'gasSg', label: 'Gas gravity (air = 1)' },
  { property: 'temperature', key: 'tempF', label: 'Temperature (degF)' },
  { property: 'rsb', key: 'gor', label: 'Solution GOR (scf/STB)' },
  { property: 'pb', key: 'pb', label: 'Bubble point (psia)' },
]);

/** The fields of the shared kr intake card in the builder (stored keys of form.scal). */
export const SIM_KR_FIELDS = Object.freeze([
  { key: 'Swc', label: 'Swc' }, { key: 'Sor', label: 'Sor' }, { key: 'krwMax', label: 'krw max' }, { key: 'kroMax', label: 'kro max' },
  { key: 'nw', label: 'nw' }, { key: 'no', label: 'no' }, { key: 'Sgc', label: 'Sgc' }, { key: 'Sorg', label: 'Sorg' },
  { key: 'krgMax', label: 'krg max' }, { key: 'krogMax', label: 'krog max' }, { key: 'ng', label: 'ng' }, { key: 'nog', label: 'nog' },
  { key: 'jA', label: 'J: a' }, { key: 'jB', label: 'J: b' }, { key: 'swirr', label: 'J: Swirr' },
  { key: 'k_md', label: 'k (mD)' }, { key: 'phi', label: 'porosity' }, { key: 'sigma_dyncm', label: 'IFT (dyn/cm)' }, { key: 'thetaDeg', label: 'contact angle (deg)' },
]);

/** The builder's current kr values, flat, for the card's "Now" column. */
export function krCurrentValues(form) {
  const sc = form?.scal || {};
  return { ...(sc.ow || {}), ...(sc.go || {}), ...(sc.pc || {}) };
}

/**
 * Take a pvt-1 block into the builder form.
 * @param {object} form the builder form
 * @param {object} block the pvt-1 block, read by id (project_id and project_name set)
 * @param {{at?: string}} [opts]
 * @returns {{ok: boolean, errors: string[], form?: object, rows?: object}}
 */
export function takePvtIntoForm(form, block, { at = new Date().toISOString() } = {}) {
  const b = pvtContractOf(block);
  if (!b) return { ok: false, errors: ['The Fluid Systems Studio project carries no pvt-1 block.'] };
  const gate = validatePvtContract(b);
  if (!gate.ok) return { ok: false, errors: [`The PVT block is incomplete: ${gate.errors.join(' ')}`] };
  if (b.units?.pressure && b.units.pressure !== 'psia') return { ok: false, errors: [`The block states its pressures in "${b.units.pressure}", which the deck builder does not read.`] };
  const rows = simRowsFromContract(b);
  if (!rows.ok) return { ok: false, errors: rows.reasons };
  if (!rows.pvtw) return { ok: false, errors: ['The table holds no water columns, so PVTW cannot be written from it. Take the water from the typed fields: drop the block.'] };
  const values = {
    api: b.inputs?.oil_gravity ?? null,
    gasSg: b.inputs?.gas_gravity ?? null,
    tempF: b.inputs?.temperature ?? null,
    gor: b.inputs?.rsb ?? null,
    pb: rows.pb ?? null,
  };
  if (!finite(values.api) || !finite(values.gasSg)) {
    return { ok: false, errors: ['The block does not state the oil and gas gravity the surface densities are written from.'] };
  }
  const intake = {
    from: {
      app: b.source_app || PVT_PRODUCER,
      recordId: b.project_id || null,
      recordName: b.project_name || null,
      at,
      generatedAt: b.generated_at || null,
      build: b.app_build || null,
    },
    values,
    contract: b,
  };
  const next = structuredClone(form);
  next.pvtSource = { mode: 'fluid', intake };
  next.fluid = { ...next.fluid, api: s(values.api), gasSg: s(values.gasSg), tempF: s(values.tempF), gor: s(values.gor) };
  next.water = {
    ...next.water,
    pref: s(rows.pvtw.pref), bw: s(rows.pvtw.bw), cw: s(rows.pvtw.cw), muw: s(rows.pvtw.muw),
  };
  next.rock = { ...next.rock, pref: s(rows.pvtw.pref) };
  return { ok: true, errors: [], form: next, rows };
}

/** Back to the typed correlation inputs; the received values stay in the fields. */
export function dropPvtIntake(form) {
  const next = structuredClone(form);
  next.pvtSource = { mode: 'correlation', intake: null };
  return next;
}

/**
 * Take a kr-1 block into the builder form.
 * @returns {{ok: boolean, errors: string[], warnings: string[], form?: object}}
 */
export function takeKrIntoForm(form, block, { at = new Date().toISOString() } = {}) {
  const b = krContractOf(block);
  if (!b) return { ok: false, errors: ['The SCAL Studio project carries no kr-1 block.'], warnings: [] };
  const gate = validateKrContract(b);
  if (!gate.ok) return { ok: false, errors: [`The kr-1 block is incomplete: ${gate.errors.join(' ')}`], warnings: [] };
  const ow = b.oil_water?.params;
  const go = b.gas_oil?.params;
  const errors = [];
  if (!ow) errors.push('The block holds no oil-water set; the deck needs SWOF.');
  if (!go) errors.push('The block holds no gas-oil set; the deck needs SGOF. Fit or enter one on the Curves tab of SCAL Studio and save.');
  if (errors.length) return { ok: false, errors, warnings: [] };
  const warnings = [];
  // The simulator takes one connate water: SGOF ends at 1 - Swc of SWOF. A
  // gas-oil set saved at another Swc is written at the oil-water Swc, which
  // moves its normalised saturation; said here, on the card's record, in the
  // deck notes and in the report.
  let goSwcAdjusted = null;
  if (finite(go.Swc) && Math.abs(go.Swc - ow.Swc) > 1e-9) {
    goSwcAdjusted = { from: go.Swc, to: ow.Swc };
    warnings.push(`The gas-oil set was saved at Swc ${go.Swc} and the oil-water set at Swc ${ow.Swc}. The deck takes one connate water, so the gas-oil set is written at Swc ${ow.Swc}; its curves move. To keep them, make the two equal in SCAL Studio and take the project again.`);
  }
  const j = b.capillary?.j;
  const r = b.capillary?.reservoir;
  const pcOk = !!(j && r && finite(j.a) && finite(j.b) && finite(j.Swirr) && finite(r.k_md) && finite(r.phi) && finite(r.sigma_dyncm) && finite(r.thetaDeg));
  if (!pcOk) warnings.push('The block holds no Leverett J with its rock: the deck is written without capillary pressure.');
  else if (!(ow.Swc > j.Swirr + 1e-9)) warnings.push(`Swc ${ow.Swc} is at or below the J curve's Swirr ${j.Swirr}, where the power-law Pc has no finite value: the deck is written without capillary pressure until Swc is raised.`);
  const next = structuredClone(form);
  next.scal = {
    ow: { Swc: s(ow.Swc), Sor: s(ow.Sor), krwMax: s(ow.krwMax), kroMax: s(ow.kroMax), nw: s(ow.nw), no: s(ow.no) },
    go: { Sgc: s(go.Sgc ?? 0), Sorg: s(go.Sorg), krgMax: s(go.krgMax), krogMax: s(go.krogMax), ng: s(go.ng), nog: s(go.nog) },
    pc: pcOk
      ? { enabled: ow.Swc > j.Swirr + 1e-9, jA: s(j.a), jB: s(j.b), swirr: s(j.Swirr), k_md: s(r.k_md), phi: s(r.phi), sigma_dyncm: s(r.sigma_dyncm), thetaDeg: s(r.thetaDeg) }
      : { ...(next.scal?.pc || {}), enabled: false },
  };
  const values = { ...next.scal.ow, ...next.scal.go, ...(pcOk ? next.scal.pc : {}) };
  delete values.enabled;
  next.krSource = { mode: 'scal', intake: { ...krIntakeRecord({ contract: b, set: 'oil_water', values, at }), goSwcAdjusted } };
  return { ok: true, errors: [], warnings, form: next };
}

export function dropKrIntake(form) {
  const next = structuredClone(form);
  next.krSource = { mode: 'typed', intake: null };
  return next;
}

/** Keys of the kr form whose value differs from what the block sent. */
export function krEditedKeys(form) {
  const v = form?.krSource?.intake?.values;
  if (!v) return [];
  const now = krCurrentValues(form);
  return Object.keys(v).filter((k) => now[k] != null && String(now[k]) !== '' && Number(now[k]) !== Number(v[k]));
}

const ascii = (x) => String(x ?? '').replace(/[^\x20-\x7e]/g, '?');

/**
 * The comment lines a generated deck carries about where its tables came
 * from (composeDeck spec.notes): one block for PVT, one for the saturation
 * functions, each with the source project, the time it was taken, the
 * build and the method words, or the statement that the values were typed.
 */
export function provenanceNotes(form, { pb = null } = {}) {
  const out = [];
  const pvt = form?.pvtSource;
  if (pvt?.mode === 'fluid' && pvt.intake?.contract) {
    const f = pvt.intake.from || {};
    out.push(`PVT (PVTO, PVDG, PVTW, DENSITY oil and gas): pvt-1 from ${ascii(f.app)} project "${ascii(f.recordName)}" (id ${ascii(f.recordId)}), taken ${ascii(f.at)}, block saved ${ascii(f.generatedAt)}, build ${ascii(f.build)}`);
    pvtContractCsvHeader(pvt.intake.contract, { prefix: 'PVT ' }).forEach((l) => out.push(ascii(l)));
  } else {
    out.push('PVT (PVTO, PVDG): entered in the deck builder, black-oil correlations of Fluid Systems Studio:');
    out.push('PVT methods: Standing Pb, Rs and Bo; Beggs-Robinson oil viscosity; Dranchuk-Abou-Kassem Z');
    out.push(`PVT inputs: API ${ascii(form?.fluid?.api)}, gas gravity ${ascii(form?.fluid?.gasSg)}, ${ascii(form?.fluid?.tempF)} degF, GOR ${ascii(form?.fluid?.gor)} scf/STB${finite(pb) ? `; bubble point solved ${Math.round(pb)} psia` : ''}`);
    out.push('PVTW: entered in the deck builder');
  }
  const kr = form?.krSource;
  if (kr?.mode === 'scal' && kr.intake?.contract) {
    const f = kr.intake.from || {};
    out.push(`SWOF, SGOF: kr-1 from ${ascii(f.app || KR_PRODUCER)} project "${ascii(f.recordName)}" (id ${ascii(f.recordId)}), taken ${ascii(f.at)}, block saved ${ascii(f.generatedAt)}, build ${ascii(f.build)}`);
    describeKrContract(kr.intake.contract).forEach(([k, v]) => out.push(ascii(`kr-1 ${k}: ${v}`)));
    const edited = krEditedKeys(form);
    if (edited.length) out.push(`Edited in the deck builder after intake: ${edited.join(', ')}`);
    const adj = kr.intake.goSwcAdjusted;
    if (adj) out.push(`Gas-oil set saved at Swc ${adj.from}, written at the oil-water Swc ${adj.to} (one connate water in the deck)`);
  } else {
    out.push('SWOF, SGOF: Corey parameters entered in the deck builder');
  }
  out.push(form?.scal?.pc?.enabled ? 'Pcow: Leverett J power law, Pc in psi at each SWOF row' : 'Pcow: zero (no capillary pressure)');
  out.push('Pcog: zero (no gas-oil capillary pressure model)');
  return out;
}
