// Electrofacies Studio (Data & AI D3): the wells registry, read and written
// through its own shared services. Curves come from src/lib/wellsRegistry.js
// (the Well Data Manager's store) exactly as the ML Workbench reads them;
// interval logs (core facies, core descriptions, lithology) from
// src/lib/stratRegistry.js listIntervals. No query of its own.
import { listIntervals } from '@/lib/stratRegistry';
import {
  listWells, listLogs, saveLog, loadWellBlock, curveInventory,
} from '@/utils/dataAi/mlSources';
import { tableFromBlocks } from '@/utils/dataAi/mlData';
import { compactIntervals } from '@/utils/dataAi/faciesData';

export {
  listWells, listLogs, saveLog, loadWellBlock, curveInventory,
};

/**
 * Several wells, in the order given, as one table, with each well's
 * interval logs (every kind) kept beside it for the core facies picker.
 * A well whose intervals cannot be read still loads; the note says so.
 */
export async function loadFaciesWellsTable(wells, names) {
  const blocks = [];
  const intervals = {};
  const notes = [];
  for (const w of wells) {
    blocks.push((await loadWellBlock(w, names)).block);
    try {
      intervals[w.name] = compactIntervals(await listIntervals(w.id));
    } catch (e) {
      intervals[w.name] = [];
      notes.push(`${w.name}: its interval logs could not be read (${e.message}).`);
    }
  }
  const t = tableFromBlocks(blocks);
  return {
    ...t, intervals, facies: null, faciesName: null, notes: [...t.notes, ...notes],
  };
}
