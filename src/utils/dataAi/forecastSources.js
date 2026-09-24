// Production Forecasting ML Workbench (Data & AI D4): reading the Production
// data spine through its own shared service (src/lib/productionSpine.js).
// No query of its own and no write: the spine owns po_daily_production, and
// getDailyProduction pages past the 1,000-row PostgREST cap.
import { listFields, listPoWells, getDailyProduction } from '@/lib/productionSpine';
import { forecastTableFromSpine } from '@/utils/dataAi/forecastData';

export { listFields, listPoWells };

/** The producing wells of a field (injectors and observation wells left out). */
export async function listProducers(fieldId) {
  const wells = await listPoWells(fieldId);
  return wells.filter((w) => w.well_type !== 'injector' && w.well_type !== 'observation');
}

/**
 * The chosen wells' stored rows for one phase as a series table. One read of
 * the field's ledger for several wells, one read per well for a single well.
 */
export async function loadSpineTable({
  field, wells, phase, step, missing,
}) {
  if (!wells.length) throw new Error('Choose at least one well.');
  const rows = wells.length === 1
    ? await getDailyProduction(field.id, { wellId: wells[0].id })
    : await getDailyProduction(field.id);
  return forecastTableFromSpine({
    field, wells, rows, phase, step, missing,
  });
}
