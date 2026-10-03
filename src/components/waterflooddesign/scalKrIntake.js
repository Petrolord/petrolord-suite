// SCAL Studio -> Waterflood Design Studio kr intake (SC5). Pure mapper for
// the navigate-state handoff (the WT5/wellTestIntake pattern): validates
// the payload and returns a displacementInputs patch (studio string form
// convention) plus the notification text, or null when the payload is not
// usable. The studio applies the patch in a one-shot effect.
//
// SCAL-U1 (RL11): when the payload carries the kr-1 block (`contract`), the
// patch also stores `krIntake`, the record the shared KrIntakeCard reads:
// where the set came from (fitted to which sample, or typed), the project,
// the time and the values received. Waterflood used to show the source in
// a toast and keep nothing. `scalKrFromContract` rebuilds the version 1
// payload from a block read by id, so a fresh visit takes the same path.
import { validateKrTable } from '@/utils/fractionalFlowCalculations';
import { krContractOf, krContractSourceText } from '@/lib/inputProvenance/krContract';
import { krIntakeRecord } from '@/lib/inputProvenance/krIntakeCard';

/** The values a Waterflood project takes from a SCAL set, for the intake card. */
export const SCAL_INTAKE_FIELDS = Object.freeze([
  { key: 'Swc', label: 'Swc' }, { key: 'Sor', label: 'Sor' }, { key: 'krwMax', label: 'krw at Sor' },
  { key: 'kroMax', label: 'kro at Swc' }, { key: 'nw', label: 'nw' }, { key: 'no', label: 'no' },
  { key: 'muW', label: 'Water viscosity' }, { key: 'muO', label: 'Oil viscosity' },
]);

/** The version 1 handoff rebuilt from a kr-1 block (a read by id; no viscosities travel in the block). */
export function scalKrFromContract(contract) {
  const b = krContractOf(contract);
  if (!b?.oil_water) return null;
  return { source: b.project_name || 'SCAL Studio', krSource: 'corey', corey: { ...b.oil_water.params }, muW: null, muO: null, contract: b };
}

const pos = (v) => Number.isFinite(v) && v > 0;
const frac = (v) => Number.isFinite(v) && v >= 0 && v < 1;

export function mapScalKrIntake(scalKr) {
  if (!scalKr || typeof scalKr !== 'object') return null;

  if (scalKr.krSource === 'corey' && scalKr.corey) {
    const c = scalKr.corey;
    if (!frac(c.Swc) || !frac(c.Sor) || !(1 - c.Swc - c.Sor > 0.01)
      || !pos(c.krwMax) || !pos(c.kroMax) || !pos(c.nw) || !pos(c.no)) {
      return null;
    }
    const patch = {
      krSource: 'corey',
      Swc: String(c.Swc), Sor: String(c.Sor),
      krwMax: String(c.krwMax), kroMax: String(c.kroMax),
      nw: String(c.nw), no: String(c.no),
    };
    if (pos(scalKr.muW)) patch.muW = String(scalKr.muW);
    if (pos(scalKr.muO)) patch.muO = String(scalKr.muO);
    const contract = krContractOf(scalKr.contract);
    if (contract) {
      const values = { Swc: c.Swc, Sor: c.Sor, krwMax: c.krwMax, kroMax: c.kroMax, nw: c.nw, no: c.no };
      if (pos(scalKr.muW)) values.muW = scalKr.muW;
      if (pos(scalKr.muO)) values.muO = scalKr.muO;
      patch.krIntake = krIntakeRecord({ contract, set: 'oil_water', values });
    }
    return {
      patch,
      note: contract
        ? `Corey relative permeability received and applied to the displacement inputs. Source: ${krContractSourceText(contract, 'oil_water')}.`
        : `Corey relative permeability set received from ${scalKr.source || 'SCAL Studio'} and applied to the displacement inputs.`,
    };
  }

  if (scalKr.krSource === 'table' && Array.isArray(scalKr.table)) {
    const { ok, table } = validateKrTable(scalKr.table);
    if (!ok) return null;
    return {
      patch: { krSource: 'table', krTable: table },
      note: `Relative permeability table (${table.length} rows) received from ${scalKr.source || 'SCAL Studio'} and applied to the displacement inputs.`,
    };
  }

  return null;
}
