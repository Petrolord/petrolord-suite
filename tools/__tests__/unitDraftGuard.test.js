/**
 * UNIT DRAFT GUARD as a jest gate.
 *
 * tools/unit-draft-guard.mjs lists controlled inputs whose value is a unit
 * conversion or rounded copy of state, whose onChange parses every key, and
 * which keep no draft: the shape that eats a typed decimal point ("2."
 * shows as "2", "13.7" m is stored as 137 m). On origin/main before
 * 2026-10-04 it listed seven boxes (Petrophysics depth bin, six Basin &
 * Charge Modeling boxes); all seven now use src/hooks/useUnitDraft.js, so
 * the tree is held at zero. A deliberate exception goes in ALLOWED with its
 * reason, never by loosening the pattern.
 *
 * The negative control runs the scanner on the exact pre-fix Petrophysics
 * tag and requires a hit, so a scanner that silently matches nothing cannot
 * pass this gate.
 */
import path from 'node:path';
import { scan, scanSource } from '../unit-draft-guard.mjs';

const ROOT = path.resolve(__dirname, '..', '..');

// { file, reason } for a box that is listed but known to be safe
const ALLOWED = [];

test('no converted input without a draft under src/', () => {
  const hits = scan(ROOT).filter((h) => !ALLOWED.some((a) => a.file === h.file));
  expect(hits.map((h) => `${h.file}:${h.line} value={${h.value}}`)).toEqual([]);
});

describe('the scanner itself', () => {
  test('flags the pre-fix Petrophysics depth bin box (negative control)', () => {
    const src = `
      <input className={x} data-testid="petro-density-depthbin"
        value={String(Number(toDisplay(densityBinM, depthUnit).toFixed(depthUnit === 'ft' ? 1 : 2)))}
        onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) setDens({ depthBinM: fromDisplay(v, depthUnit) }); }} />`;
    expect(scanSource(src)).toHaveLength(1);
  });

  test('flags the pre-fix Basin box, and passes the drafted one', () => {
    const bad = `<Input type="number" value={tidy(depthToDisplay(e.amount, depthUnit))} onChange={(ev) => setEvent(i, { amount: depthFromDisplay(parseFloat(ev.target.value), depthUnit) })} />`;
    const good = `<Input value={d.value} onChange={(e) => d.onChange(e.target.value)} onBlur={d.onBlur} />`;
    expect(scanSource(bad)).toHaveLength(1);
    expect(scanSource(good)).toHaveLength(0);
  });

  test('skips sliders, which are dragged and never typed', () => {
    const range = `<input type="range" value={Math.round(toDisplay(shift, ru))} onChange={(e) => set(fromDisplay(Number(e.target.value), ru))} />`;
    expect(scanSource(range)).toHaveLength(0);
  });
});
