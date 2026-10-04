/**
 * The deck upload door (SIM-U1-012; PL2, RL10). Reads the files a user
 * picked before anything is uploaded and says what it read: which file is
 * the main deck, which files it includes, which of those were not picked,
 * and anything the worker would refuse. Before, every picked file went up
 * and the last .DATA in the list silently became the main deck.
 *
 * Refused here, with the reason (the worker refuses them too, after the
 * upload): two or more .DATA files in one pick; a bundle over 25 MB; a file
 * that is not text; PYACTION or PYINPUT (embedded Python, never run).
 *
 * Pure: takes { name, size, text } per file.
 */
import { deckBlocks, summarizeDeck } from './deckSummary.js';

export const MAX_BUNDLE_BYTES = 25 * 1024 * 1024;
const TEXT_EXT = /\.(data|inc|grdecl|txt|sch|prop|grid|ecl)$/i;

/** True when the text looks binary (NUL bytes, or mostly unprintable). */
export function looksBinary(text) {
  const s = String(text || '').slice(0, 4096);
  if (!s) return false;
  if (s.includes('\u0000')) return true;
  let bad = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c < 9 || (c > 13 && c < 32)) bad += 1;
  }
  return bad / s.length > 0.05;
}

/**
 * @param {Array<{name: string, size: number, text: string}>} files
 * @param {{currentMain?: ?string, existingBytes?: number}} [opts]
 * @returns {{ok: boolean, errors: string[], warnings: string[], main: ?string,
 *   includes: string[], missingIncludes: string[], summary: ?object, readBack: string[]}}
 */
export function planDeckUpload(files, { currentMain = null, existingBytes = 0 } = {}) {
  const errors = [];
  const warnings = [];
  const list = Array.isArray(files) ? files : [];
  if (!list.length) return { ok: false, errors: ['No file was picked.'], warnings, main: null, includes: [], missingIncludes: [], summary: null, readBack: [] };
  const datas = list.filter((f) => /\.data$/i.test(f.name));
  if (datas.length > 1) errors.push(`${datas.length} main deck files were picked (${datas.map((f) => f.name).join(', ')}). Upload one .DATA deck at a time, with the files it includes.`);
  for (const f of list) {
    if (!TEXT_EXT.test(f.name)) warnings.push(`${f.name}: not a usual deck extension (.DATA, .INC, .GRDECL); it is uploaded as text.`);
    if (looksBinary(f.text)) errors.push(`${f.name} is not a text file (binary content). Decks and include files are plain text.`);
  }
  const total = list.reduce((a, f) => a + (Number(f.size) || 0), 0);
  if (total + existingBytes > MAX_BUNDLE_BYTES) errors.push(`The deck bundle would be ${((total + existingBytes) / 1048576).toFixed(1)} MB; the limit is 25 MB.`);
  const main = datas[0]?.name || null;
  const mainFile = datas[0] || null;
  let summary = null;
  let includes = [];
  if (mainFile && !looksBinary(mainFile.text)) {
    const text = mainFile.text;
    if (/^﻿/.test(text)) warnings.push(`${main} starts with a byte-order mark; if the simulator rejects the first keyword, save the file as plain UTF-8 or ASCII.`);
    const kws = deckBlocks(text).map((b) => b.keyword);
    const banned = kws.filter((k) => k === 'PYACTION' || k === 'PYINPUT');
    if (banned.length) errors.push(`${main} uses ${[...new Set(banned)].join(' and ')} (embedded Python), which the simulation worker never runs. Remove it and upload again.`);
    if (kws.includes('PATHS')) errors.push(`${main} uses PATHS, which the worker refuses: include files must sit beside the deck.`);
    summary = summarizeDeck(text);
    includes = summary.includes;
    if (!kws.includes('RUNSPEC')) warnings.push(`${main} has no RUNSPEC keyword: check that this is the main deck and not an include file.`);
    if (!summary.unitSystemStated) warnings.push(`${main} states no unit system; the simulator reads it as METRIC.`);
  } else if (!mainFile && !currentMain) {
    errors.push('No .DATA main deck was picked and the case has none yet. Pick the .DATA file with its include files.');
  }
  const picked = new Set(list.map((f) => f.name.toUpperCase()));
  const missingIncludes = includes.filter((n) => !picked.has(String(n).split('/').pop().toUpperCase()));
  if (missingIncludes.length) warnings.push(`${main} includes ${missingIncludes.join(', ')}, not picked here. Upload ${missingIncludes.length === 1 ? 'it' : 'them'} too, or the run fails when the simulator reads the include.`);
  const readBack = [];
  if (main) readBack.push(`Main deck: ${main}${summary?.unitSystem ? `, ${summary.unitSystem} units` : ''}${summary?.dims ? `, ${summary.dims.nx} x ${summary.dims.ny} x ${summary.dims.nz} grid` : ''}${summary ? `, ${summary.wells.length} wells` : ''}.`);
  else if (currentMain) readBack.push(`The case's main deck stays ${currentMain.split('/').pop()}.`);
  const others = list.filter((f) => f !== mainFile).map((f) => f.name);
  if (others.length) readBack.push(`Other files: ${others.join(', ')}.`);
  return { ok: errors.length === 0, errors, warnings, main, includes, missingIncludes, summary, readBack };
}
