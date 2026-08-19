/**
 * Fault-stick import vs a COMMITTED dialect fixture: parsing the
 * hand-authored Charisma fault-stick file (the Petrel/seismiqb
 * FAULT_STICKS column layout, positive-down z) lands the hand-computed
 * lattice sticks exactly, groups/orders faults and sticks, and
 * round-trips through the suite's own writer. The engines repo holds
 * the parser round-trip and counting tests; this pins the committed
 * dialect sample against drift.
 */
import fs from 'fs';
import path from 'path';

import {
  detectFaultStickFormat, parseFaultStickFile, faultSticksToLattice,
} from '@/pages/apps/Seismolord/engine/faultImport';
import {
  faultSticksToRows, writeCharismaFaultSticks,
} from '@/pages/apps/Seismolord/engine/pickExport';

const FIXTURE = path.join(
  __dirname, '..', '..', '..', '..', '..',
  'test-data', 'seismolord', 'faults', 'demo_faultsticks_charisma.txt',
);

// the survey the fixture was hand-computed against
const geom = { nIl: 10, nXl: 12, ns: 100 };
const lines = { il0: 100, ilStep: 2, xl0: 500, xlStep: 3 };
const affine = {
  origin: { x: 610000, y: 6070000 },
  ilVec: { x: 0, y: 25 },
  xlVec: { x: 25, y: 0 },
};
const dtMs = 4;

describe('committed Charisma fault-stick fixture', () => {
  const text = fs.readFileSync(FIXTURE, 'utf8');

  test('detects the dialect', () => {
    expect(detectFaultStickFormat(text)).toBe('charisma');
  });

  test('lands the hand-computed lattice sticks exactly', () => {
    const parsed = parseFaultStickFile(text);
    expect(parsed.faults.map((f) => f.name)).toEqual(['Fault_A', 'Fault_B']);
    // fixture z is positive-down (Petrel convention): sign +1
    const out = faultSticksToLattice(parsed.faults, geom, lines, affine, (z) => z / dtMs);
    expect(out.placed).toBe(7);
    expect(out.skipped).toBe(0);
    expect(out.droppedSticks).toBe(0);
    const [fa, fb] = out.faults;
    expect(fa.sticks.map((st) => st.points)).toEqual([
      [{ il: 1, xl: 1, s: 10 }, { il: 1, xl: 2, s: 30 }, { il: 1, xl: 3, s: 50 }],
      [{ il: 3, xl: 1, s: 11 }, { il: 3, xl: 3, s: 52.5 }],
    ]);
    expect(fb.sticks.map((st) => st.points)).toEqual([
      [{ il: 2, xl: 4, s: 25 }, { il: 2, xl: 5, s: 45 }],
    ]);
  });

  test('the suite writer reproduces a file the reader lands identically', () => {
    const parsed = parseFaultStickFile(text);
    const landed = faultSticksToLattice(parsed.faults, geom, lines, affine, (z) => z / dtMs);
    const rewritten = writeCharismaFaultSticks(landed.faults.map((f) => ({
      name: f.name,
      rows: faultSticksToRows(f.sticks, affine, (s) => s * dtMs, lines),
    })));
    const again = faultSticksToLattice(
      parseFaultStickFile(rewritten).faults, geom, lines, affine, (z) => z / dtMs,
    );
    expect(again.faults).toEqual(landed.faults);
  });
});
