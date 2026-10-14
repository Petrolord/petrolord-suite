// 2026-10-14: an EMW imported through the calibration door reads back as the
// file's own value on the chart and in the readout (the studio's 0.052 psi/ft
// drilling rule both ways); the kit's 13.74 ppg leak-off read 13.73 through the
// exact-density door.
import fs from 'fs';
import path from 'path';
import { parseCalibrationTable, convertCalibration } from '../services/calibrationImport';
import { emwPpg, emwReferenceDepthM } from '../services/units';
import { ppfgUnit } from '../../../../lib/ppfgUnits';

const KIT = path.join(__dirname, 'fixtures', 'calibration-kit');
const CTX = { frame: null, kbM: 25, mudlineMdM: 60, waterDepthM: 35, wellName: 'PPS demo: Ekene-1' };

test('the kit leak-off and integrity tests read back as written, to the last digit', () => {
  const t = parseCalibrationTable(fs.readFileSync(path.join(KIT, 'ekene-lot-fit.csv'), 'utf8'));
  const { points } = convertCalibration(t, t.guess, CTX);
  const back = points.map((p) => emwPpg(p.pMpa * 1e6, emwReferenceDepthM(p.z, CTX)));
  expect(back.map((v) => v.toFixed(2))).toEqual(['11.18', '13.74', '15.18']);
  back.forEach((v, k) => expect(v).toBeCloseTo([11.18, 13.74, 15.18][k], 9));
});

test('mud weights held over intervals read back as written at both ends', () => {
  const t = parseCalibrationTable(fs.readFileSync(path.join(KIT, 'ekene-mud-weights.csv'), 'utf8'));
  const { points } = convertCalibration(t, t.guess, CTX);
  for (const p of points) expect(emwPpg(p.pMpa * 1e6, emwReferenceDepthM(p.z, CTX))).toBeCloseTo(p.emwPpg, 9);
});

test('negative control: the exact-density door reads the 13.74 ppg test 0.1% lower', () => {
  const conv = ppfgUnit('ppg');
  const tvd = 1449.93; const z = tvd - 60;
  const viaDoor = emwPpg(conv.toMpa(13.74, tvd) * 1e6, emwReferenceDepthM(z, CTX));
  expect(13.74 - viaDoor).toBeGreaterThan(0.005);
});
