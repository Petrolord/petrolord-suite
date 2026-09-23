// Data Quality Studio (Data & AI D1): reading the two stored sources through
// their own shared services. No query of its own and no write: the wells
// registry (Well Data Manager) and the Production data spine own their data.
import { listWells, listLogs, downloadCurve } from '@/lib/wellsRegistry';
import { listFields, listPoWells, getDailyProduction } from '@/lib/productionSpine';
import { datasetFromWellLogs, datasetFromProduction } from '@/utils/dataAi/qcDatasets';

export { listWells, listLogs, listFields, listPoWells };

const DEPTH_MNEMONICS = ['DEPT', 'DEPTH', 'MD'];
export const isDepthLog = (log) => DEPTH_MNEMONICS.includes(String(log.mnemonic || '').toUpperCase().split(':')[0]);

/**
 * Download the chosen curves of one well (and its depth curve, if stored)
 * and build the dataset. wells is the registry list, used for the uniqueness
 * check on well names.
 */
export async function loadWellDataset({ well, logs, chosenIds, wells = [] }) {
  const depth = logs.find(isDepthLog);
  const picked = logs.filter((l) => chosenIds.includes(l.id) && l !== depth);
  if (!picked.length) throw new Error('Choose at least one curve.');
  const use = depth ? [depth, ...picked] : picked;
  const samples = {};
  for (const log of use) samples[log.id] = await downloadCurve(log);
  return datasetFromWellLogs({ well, logs: use, samples, wellNames: wells.map((w) => w.name) });
}

/** One production well's rows from the spine, as a dataset. */
export async function loadProductionDataset({ field, well, fieldWells = [] }) {
  const rows = await getDailyProduction(field.id, { wellId: well.id });
  if (!rows.length) throw new Error(`${well.name} has no production rows in ${field.name}.`);
  return datasetFromProduction({ field, well, rows, fieldWellNames: fieldWells.map((w) => w.name) });
}
