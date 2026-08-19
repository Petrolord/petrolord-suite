/**
 * Horizon pick export writers vs the Python oracle goldens
 * (tools/validation/seismolord/extract_goldens.py write_picks): the
 * oracle ships the float32 pick lattice + exact survey affine in the
 * meta JSON; we run picksToPickRows + the writers over that blob and
 * assert byte identity with the committed text files. Two fixtures:
 * dome_ieee (axis-aligned, unit steps) and dome_step (azimuth 180,
 * il step 2 / xl step 3 — descending world coordinates).
 */
import fs from 'fs';
import path from 'path';

import {
  picksToPickRows, writeCharismaHorizon, writeIlXlXyz, writeXyzPoints,
} from '@/pages/apps/Seismolord/engine/pickExport';

const PICKS_DIR = path.join(
  __dirname, '..', '..', '..', '..', '..', 'test-data', 'seismolord', 'picks');

const FIXTURES = ['dome_ieee_picks', 'dome_step_picks'];

describe.each(FIXTURES)('%s vs oracle goldens (byte identity)', (base) => {
  const meta = JSON.parse(
    fs.readFileSync(path.join(PICKS_DIR, `${base}_meta.json`), 'utf8'));
  const raw = Buffer.from(meta.picks.base64, 'base64');
  const picks = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const g = meta.geometry;
  const affine = {
    origin: meta.affine.origin,
    ilVec: meta.affine.il_vec,
    xlVec: meta.affine.xl_vec,
  };
  const rows = picksToPickRows(
    picks,
    { nIl: g.n_il, nXl: g.n_xl },
    affine,
    (s) => -(s * g.dt_ms),
    { il0: g.il0, ilStep: g.il_step, xl0: g.xl0, xlStep: g.xl_step },
  );

  test('live-row count matches the oracle', () => {
    expect(rows.length).toBe(meta.live_rows);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(g.n_il * g.n_xl);   // nulls were skipped
  });

  test('Charisma writer matches the golden byte-for-byte', () => {
    const ref = fs.readFileSync(path.join(PICKS_DIR, `${base}_charisma.txt`), 'utf8');
    expect(writeCharismaHorizon(rows)).toBe(ref);
  });

  test('il/xl/x/y/z writer matches the golden byte-for-byte', () => {
    const ref = fs.readFileSync(path.join(PICKS_DIR, `${base}_ilxl.txt`), 'utf8');
    expect(writeIlXlXyz(rows)).toBe(ref);
  });

  test('XYZ points writer matches the golden byte-for-byte', () => {
    const ref = fs.readFileSync(path.join(PICKS_DIR, `${base}.xyz`), 'utf8');
    expect(writeXyzPoints(rows)).toBe(ref);
  });
});
