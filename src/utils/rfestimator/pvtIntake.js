/**
 * PVT from a Fluid Systems Studio project into the Recovery Factor
 * Estimator (RF-U1-010; reviewer lens RL11, plan Step 0c). The pvt-1 block
 * of a saved Fluid project is read by id (src/lib/pvtSource.js); it gives:
 *
 *   oil, at the bubble point of the block   pb, Bob, muob   (solution-gas correlation)
 *   oil, at the initial pressure pi         Boi, muoi, muwi (water-drive correlation; Boi also in the volumetrics)
 *   gas, at pi and at pa                    zi, za          (p/z depletion); Bgi at pi (volumetrics)
 *
 * The block holds Bg in RB/scf; the estimator holds Bgi in reservoir ft3 per
 * scf, converted through the unit registry (x 5.6146). Values are read by
 * linear interpolation in the block's own table and never extrapolated: a
 * pressure outside the table leaves that value alone and says so.
 *
 * What is stored with the project (`pvtIntake`) has the shape the shared
 * card (src/lib/inputProvenance/PvtIntakeCard.jsx) reads: the Fluid project,
 * the time, the values taken, the method of each, and the block without its
 * table ("source changed since", "edited after intake").
 *
 * Pure.
 */
import { convert } from '@/lib/units/registry';
import { pvtContractOf, pvtContractSummary, pvtContractSourceText, PVT_PRODUCER } from '@/lib/inputProvenance/pvtContract';
import { tableAt } from '@/utils/waterflooddesign/pvtIntake';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const g4 = (v) => String(parseFloat(Number(v).toPrecision(4)));

/** Every value the intake can fill: card key, where it lands, how it is read. */
export const RF_PVT_FIELDS = Object.freeze([
  { key: 'pb', label: 'Bubble point pb (psia)', phase: 'oil', at: 'saturation', sat: 'pressure', method: 'pb', targets: [['corr', 'pb']] },
  { key: 'bob', label: 'Bob (RB/STB), at pb', phase: 'oil', at: 'saturation', sat: 'Bo', method: 'bo', targets: [['corr', 'bob']] },
  { key: 'muob', label: 'muob (cP), at pb', phase: 'oil', at: 'saturation', sat: 'mu_o', method: 'mu_o', targets: [['corr', 'muob']] },
  { key: 'boi', label: 'Boi (RB/STB), at pi', phase: 'oil', at: 'pi', column: 'Bo', method: 'bo', targets: [['corr', 'boi'], ['vol', 'boi']] },
  { key: 'muoi', label: 'muoi (cP), at pi', phase: 'oil', at: 'pi', column: 'mu_o', method: 'mu_o_undersaturated', targets: [['corr', 'muoi']] },
  { key: 'muwi', label: 'muwi (cP), at pi', phase: 'oil', at: 'pi', column: 'mu_w', method: 'mu_w', targets: [['corr', 'muwi']] },
  { key: 'zi', label: 'zi, at pi', phase: 'gas', at: 'pi', column: 'Z', method: 'z', targets: [['corr', 'zi']] },
  { key: 'za', label: 'za, at pa', phase: 'gas', at: 'pa', column: 'Z', method: 'z', targets: [['corr', 'za']] },
  { key: 'bgi', label: 'Bgi (ft3/scf), at pi', phase: 'gas', at: 'pi', column: 'Bg', method: 'bg', targets: [['vol', 'bgi']] },
]);

/**
 * @param {object} contract the pvt-1 block (with project_id and project_name)
 * @param {{phase: 'oil'|'gas', piPsia?: ?number, paPsia?: ?number, at?: string}} o
 * @returns {{ok: boolean, errors: string[], skipped?: string[], patch?: {corr: object, vol: object}, intake?: object}}
 */
export function rfPvtIntake(contract, { phase = 'oil', piPsia = null, paPsia = null, at: takenAt = new Date().toISOString() } = {}) {
  const b = pvtContractOf(contract);
  if (!b) return { ok: false, errors: ['No pvt-1 block: the Fluid Systems Studio project carries no PVT.'] };
  const table = b.table || [];
  const ps = table.map((r) => r.pressure).filter(finite);
  const span = ps.length ? `${Math.min(...ps)} to ${Math.max(...ps)} psia` : 'no table';
  const raw = {};
  const where = {};
  const skipped = [];
  for (const f of RF_PVT_FIELDS.filter((x) => x.phase === phase)) {
    if (f.at === 'saturation') {
      const v = f.sat === 'pressure' ? b.at_saturation?.pressure : b.at_saturation?.[f.sat];
      if (finite(v)) { raw[f.key] = v; where[f.key] = `at the bubble point, ${g4(b.at_saturation?.pressure)} psia`; } else skipped.push(`${f.label}: the block states no value at saturation`);
      continue;
    }
    const p = f.at === 'pi' ? piPsia : paPsia;
    if (!finite(p)) { skipped.push(`${f.label}: ${f.at} is blank`); continue; }
    const v = tableAt(table, f.column, p);
    if (finite(v)) { raw[f.key] = v; where[f.key] = `at ${g4(p)} psia (${f.at})`; } else skipped.push(`${f.label}: ${g4(p)} psia is outside the table (${span}) or the table has no ${f.column}; not extrapolated`);
  }
  if (finite(raw.bgi)) raw.bgi = convert('fvfGas', raw.bgi, 'RB/scf', 'rcf/scf');
  if (!Object.keys(raw).length) return { ok: false, errors: [`Nothing could be taken. ${skipped.join('; ')}.`] };
  const values = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, g4(v)]));
  const patch = { corr: {}, vol: {} };
  for (const f of RF_PVT_FIELDS) {
    if (values[f.key] == null) continue;
    for (const [group, key] of f.targets) patch[group][key] = values[f.key];
  }
  const methods = Object.fromEntries(RF_PVT_FIELDS.filter((f) => values[f.key] != null)
    .map((f) => [f.key, pvtContractSourceText(b, f.method, { where: where[f.key] })]));
  return {
    ok: true,
    errors: [],
    skipped,
    patch,
    intake: {
      from: {
        app: b.source_app || PVT_PRODUCER, recordId: b.project_id ?? null, recordName: b.project_name ?? null,
        at: b.generated_at ?? null, takenAt, build: b.app_build ?? null, schema: b.schema,
      },
      phase,
      pi_psia: finite(piPsia) ? piPsia : null,
      pa_psia: finite(paPsia) ? paPsia : null,
      values,
      fields: Object.keys(values),
      methods,
      skipped,
      contract: pvtContractSummary(b),
    },
  };
}

/** The current values of the estimator by card key, for "edited after intake". */
export function rfPvtCurrent(inputs) {
  const c = inputs?.corr || {};
  const v = inputs?.vol || {};
  return { pb: c.pb, bob: c.bob, muob: c.muob, boi: c.boi, muoi: c.muoi, muwi: c.muwi, zi: c.zi, za: c.za, bgi: v.bgi };
}

/** Card fields with the method each was read with. */
export function rfPvtCardFields(intake) {
  return RF_PVT_FIELDS.filter((f) => intake?.values?.[f.key] != null)
    .map((f) => ({ key: f.key, label: f.label, method: intake?.methods?.[f.key] || undefined }));
}

/** The card key of a stored input, when the intake fills it. */
export function pvtKeyFor(group, key) {
  const f = RF_PVT_FIELDS.find((x) => x.targets.some(([g, k]) => g === group && k === key));
  return f ? f.key : null;
}

/**
 * The Source column words of one input taken from the pvt-1 block, or null
 * when it was not taken; marks a value edited after the intake.
 */
export function rfPvtSourceText(intake, group, key, now) {
  const cardKey = pvtKeyFor(group, key);
  if (!cardKey || !intake?.values?.[cardKey]) return null;
  const base = intake.methods?.[cardKey] || `From ${intake.from?.app || PVT_PRODUCER}`;
  const received = intake.values[cardKey];
  if (now != null && String(now) !== '' && Number(now) !== Number(received)) {
    return `Edited in this app after the intake (received ${received}). The intake said: ${base}`;
  }
  return base;
}
