// WTA-U1-018 (PL10): a gauge file at the size a 1-second quartz gauge writes
// over a 108 hr test (388,800 readings, about 10 MB) overflowed the call
// stack in readGaugeTable (Math.max over every row) and nothing loaded.
import { importGaugeCsv } from '../gaugeImport';

test('388,800 readings load, every one, in seconds', () => {
  const lines = ['Time (hr),Pressure (psia),Temperature (degF)'];
  for (let s = 0; s < 388800; s += 1) lines.push(`${(s / 3600).toFixed(6)},${(4500 + Math.log1p(s)).toFixed(3)},${(212 + 0.001 * (s % 7)).toFixed(3)}`);
  const text = lines.join('\n');
  expect(text.length).toBeGreaterThan(9e6);
  const t0 = Date.now();
  const out = importGaugeCsv(text);
  const ms = Date.now() - t0;
  expect(out.rows).toHaveLength(388800);
  expect(out.skipped).toBe(0);
  expect(out.rows[388799].t).toBeCloseTo(388799 / 3600, 6);
  expect(ms).toBeLessThan(60000); // generous for a loaded CI runner; about 3 s here
}, 120000);
