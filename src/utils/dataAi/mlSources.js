// ML Workbench (Data & AI D2): the wells registry, read and written through
// its own shared service (src/lib/wellsRegistry.js, the Well Data Manager's
// store). No query of its own.
import {
  listWells, listLogs, downloadCurve, saveLog,
} from '@/lib/wellsRegistry';
import { wellBlock, tableFromBlocks, isDepthLog, baseName } from '@/utils/dataAi/mlData';

export { listWells, listLogs, saveLog };

/**
 * Download the named curves (and the depth curve) of one well and join
 * them. names: base mnemonics (GR, DT, ...); a well without one of them is
 * still read, and its rows count as missing there.
 */
export async function loadWellBlock(well, names) {
  const logs = await listLogs(well.id);
  const wanted = new Set(names.map(baseName));
  const seen = new Set();
  const use = logs.filter((l) => {
    if (isDepthLog(l)) return true;
    const b = baseName(l.mnemonic);
    if (!wanted.has(b) || seen.has(b)) return false;
    seen.add(b);
    return true;
  });
  const samples = {};
  for (const log of use) samples[log.id] = await downloadCurve(log);
  const r = wellBlock({ well, logs: use, samples });
  if (r.error) throw new Error(r.error);
  return { block: r.block, mnemonics: logs.map((l) => l.mnemonic) };
}

/** Several wells, in the order given, as one table. */
export async function loadWellsTable(wells, names) {
  const blocks = [];
  for (const w of wells) blocks.push((await loadWellBlock(w, names)).block);
  return tableFromBlocks(blocks);
}

/** The distinct curve mnemonics stored on the given wells (for pickers). */
export async function curveInventory(wells) {
  const byName = new Map();
  for (const w of wells) {
    const logs = await listLogs(w.id);
    logs.filter((l) => !isDepthLog(l)).forEach((l) => {
      const b = baseName(l.mnemonic);
      if (!byName.has(b)) byName.set(b, { name: b, unit: l.unit || '', wells: new Set() });
      byName.get(b).wells.add(w.name);
    });
  }
  return [...byName.values()].map((c) => ({ ...c, wells: [...c.wells] })).sort((a, b) => a.name.localeCompare(b.name));
}
