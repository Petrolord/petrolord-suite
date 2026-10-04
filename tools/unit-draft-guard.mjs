#!/usr/bin/env node
/**
 * UNIT DRAFT GUARD (report-only).
 *
 * The defect: a controlled input whose `value` is a unit conversion or a
 * rounded copy of state, and whose `onChange` parses every keystroke into
 * that state. React then writes the converted value back on every key, so
 * the decimal point is lost: "2." shows as "2" and "13.7" m is stored as
 * 137 m. Found in Well Test (WTA-U1-017), Nodal (WTA-U1-021), Petrophysics
 * (depth bin) and Basin & Charge Modeling (2026-10-04). The fix is the
 * shared draft hook in src/hooks/useUnitDraft.js.
 *
 * WHAT THIS LISTS. Every `<input` / `<Input` JSX tag under src/ (tests
 * excluded) whose `value={...}` calls a conversion or rounding helper AND
 * whose `onChange` parses the text (parseFloat, Number(), a from-display or
 * to-oilfield conversion), with no draft anywhere in the tag. It is a text
 * heuristic, not a parser of meaning, so the script reports and exits 0 by
 * default; `--strict` exits 1 on any hit. Range sliders, checkboxes, radios
 * and pickers are skipped (nothing is typed into them). On 2026-10-04 the
 * tree is clean after the fixes, so tools/__tests__/unitDraftGuard.test.js
 * holds it at zero as a jest gate; a deliberate exception goes in that
 * test's ALLOWED list with its reason.
 *
 *   node tools/unit-draft-guard.mjs            # report
 *   node tools/unit-draft-guard.mjs --json     # machine-readable
 *   node tools/unit-draft-guard.mjs --strict   # fail on any hit
 */
import fs from 'node:fs';
import path from 'node:path';

const CONVERTS = /\b(?:\w*[Tt]oDisplay|\w*[Ff]romOilfield|\w*[Tt]oOilfield|displayInputString|convert\w*|tidy|fmt\w*)\s*\(|\.toFixed\s*\(|\.toPrecision\s*\(/;
const PARSES = /\bparseFloat\s*\(|\bNumber\s*\(|\bparseInt\s*\(|\w*[Ff]romDisplay\s*\(|\w*[Tt]oOilfield\s*\(|storeInputString\s*\(/;
const DRAFTED = /draft|useDraftInput|useUnitDraft|\bd\.value\b/i;

/** The text of a JSX opening tag starting at `start` ("<input ..."), braces and strings balanced. */
function tagAt(src, start) {
  let depth = 0;
  let quote = null;
  for (let i = start + 1; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { if (depth > 0 || c !== '`') quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

/** The expression inside `name={...}` within a tag, or null. */
function attr(tag, name) {
  const m = new RegExp(`\\s${name}=\\{`).exec(tag);
  if (!m) return null;
  let depth = 1;
  const from = m.index + m[0].length;
  for (let i = from; i < tag.length; i += 1) {
    if (tag[i] === '{') depth += 1;
    else if (tag[i] === '}') { depth -= 1; if (depth === 0) return tag.slice(from, i); }
  }
  return null;
}

/** Hits in one source text: [{ line, value }]. */
export function scanSource(src) {
  const hits = [];
  const re = /<(?:input|Input)\b/g;
  let m;
  while ((m = re.exec(src))) {
    const tag = tagAt(src, m.index);
    const value = attr(tag, 'value');
    const onChange = attr(tag, 'onChange');
    if (!value || !onChange) continue;
    if (/\stype=["'{](?:range|checkbox|radio|color|file)/.test(tag)) continue; // dragged or picked, never typed
    if (DRAFTED.test(tag)) continue;
    if (!CONVERTS.test(value) || !PARSES.test(onChange)) continue;
    hits.push({ line: src.slice(0, m.index).split('\n').length, value: value.replace(/\s+/g, ' ').trim() });
  }
  return hits;
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx|js)$/.test(e.name) && !/\.test\.(jsx|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Every hit under `root`/src: [{ file, line, value }], file relative to root. */
export function scan(root) {
  const files = walk(path.join(root, 'src'), []);
  const hits = [];
  for (const f of files) {
    for (const h of scanSource(fs.readFileSync(f, 'utf8'))) hits.push({ file: path.relative(root, f), ...h });
  }
  return hits.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
}

// no import.meta here: jest's babel transform imports this file for the gate
const isMain = /unit-draft-guard\.mjs$/.test(process.argv[1] || '');
if (isMain) {
  const root = path.resolve(path.dirname(process.argv[1]), '..');
  const hits = scan(root);
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(hits, null, 2)}\n`);
  } else {
    for (const h of hits) console.log(`${h.file}:${h.line}  value={${h.value.length > 100 ? `${h.value.slice(0, 97)}...` : h.value}}`);
    console.log(`\n${hits.length} converted input(s) without a draft. See src/hooks/useUnitDraft.js.`);
  }
  if (process.argv.includes('--strict') && hits.length) process.exit(1);
}
