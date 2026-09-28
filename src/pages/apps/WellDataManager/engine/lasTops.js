// LAS 3.0 ~Tops_Data to registry tops (AppUpgrade WDM-U1-009).
//
// parseLas (3.0) hands back every non-log *_Definition / *_Data pair as a
// block of named columns and text rows. The intervals door
// (engine/lasBlocks.js) takes the top+base blocks; this one takes the
// TOPS block: one name column and one depth column, the depth converted
// to metres from the column unit. The depth must be measured depth: a
// column that names TVD or subsea is refused with the reason, the same
// rule as the log index (engine/lasIndex.js).
//
// Pure, no I/O.

import { depthUnitToMetres } from './lasImport';

const NAME_COL = /^(TOPN|TOPNAME|TOP_NAME|NAME|FORM|FORMATION|SURFACE|HORIZON|MARKER|TOPS?)$/i;
const DEPTH_COL = /^(TOPT|TOPD|TOPDEPTH|TOP_DEPTH|DEPTH|DEPT|MD|TOPMD|MD_TOP)$/i;
const VERTICAL = /^(TVD|TVDSS|TVD_SS|SSTVD|TOPTVD|TOPSS|TOP_TVDSS)$/i;

/**
 * @param {Object<string, {columns: Array<{mnemonic, unit, descr, format}>, rows: string[][]}>} blocks
 * @returns {{tops: Array<{name: string, md: number}>, block: ?string, skipped: string[]}}
 *   tops in metres MD, sorted by depth; skipped explains rows or blocks left out
 */
export function topsFromLasBlocks(blocks) {
  const skipped = [];
  const entry = Object.entries(blocks || {}).find(([name]) => /^tops?$/i.test(name));
  if (!entry) return { tops: [], block: null, skipped };
  const [blockName, block] = entry;
  const cols = block.columns || [];
  const clean = (c) => String(c.mnemonic || '').replace(/\[.*$/, '').trim();
  let nameIdx = cols.findIndex((c) => NAME_COL.test(clean(c)));
  if (nameIdx < 0) nameIdx = cols.findIndex((c) => /^S\d*$/.test(String(c.format || '')));
  let depthIdx = cols.findIndex((c, i) => i !== nameIdx && DEPTH_COL.test(clean(c)));
  const verticalIdx = cols.findIndex((c, i) => i !== nameIdx && (VERTICAL.test(clean(c)) || /true\s+vertical|sub-?sea/i.test(String(c.descr || ''))));
  if (depthIdx < 0 && verticalIdx >= 0) {
    skipped.push(`${blockName}: the depth column ${clean(cols[verticalIdx])} is a vertical depth; tops are stored in MD, so none were imported`);
    return { tops: [], block: blockName, skipped };
  }
  if (depthIdx < 0) depthIdx = cols.findIndex((c, i) => i !== nameIdx && depthUnitToMetres(c.unit) !== null);
  if (nameIdx < 0 || depthIdx < 0) {
    skipped.push(`${blockName}: no top-name and depth column pair found`);
    return { tops: [], block: blockName, skipped };
  }
  const factor = depthUnitToMetres(cols[depthIdx].unit || 'M');
  if (factor === null) {
    skipped.push(`${blockName}: depth unit "${cols[depthIdx].unit}" is not metres or feet`);
    return { tops: [], block: blockName, skipped };
  }
  const tops = [];
  (block.rows || []).forEach((row, i) => {
    const name = String(row[nameIdx] ?? '').replace(/^"|"$/g, '').trim();
    const raw = String(row[depthIdx] ?? '').trim().replace(/(\d),(\d)/g, '$1.$2');
    const v = Number(raw);
    if (!name) { skipped.push(`row ${i + 1}: no top name`); return; }
    if (raw === '' || !Number.isFinite(v)) { skipped.push(`row ${i + 1} (${name}): depth "${raw}" is not a number`); return; }
    tops.push({ name, md: v * factor });
  });
  tops.sort((a, b) => a.md - b.md);
  return { tops, block: blockName, skipped };
}
