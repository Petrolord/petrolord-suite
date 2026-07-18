// SCAL Studio -> Waterflood Design Studio kr intake (SC5). Pure mapper for
// the navigate-state handoff (the WT5/wellTestIntake pattern): validates
// the payload and returns a displacementInputs patch (studio string form
// convention) plus the notification text, or null when the payload is not
// usable. The studio applies the patch in a one-shot effect.
import { validateKrTable } from '@/utils/fractionalFlowCalculations';

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
    return {
      patch,
      note: `Corey relative permeability set received from ${scalKr.source || 'SCAL Studio'} and applied to the displacement inputs.`,
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
