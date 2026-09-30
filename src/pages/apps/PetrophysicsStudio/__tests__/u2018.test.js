/**
 * AppUpgrade PETRO-U2-018: the per-person daily cap on AI scan reads and the
 * digitizer's backup (wrapped) scale.
 * Negative controls (run 2026-09-29): with unwrapBackupScale returning the
 * values as traced, the wrapped gamma ray drops by 150 API and the unwrap
 * cases fail; with kindForStatus lacking 429 a capped read reads as a
 * generic failure.
 */
import fs from 'fs';
import path from 'path';
import { unwrapBackupScale } from '../services/digitizerScale';
import { kindForStatus, SCAN_READ_MESSAGES, SCAN_USER_DAILY_CAP } from '../services/scanRead';
import { SCAN_USER_DAILY_CAP as EDGE_CAP, utcDayStart, capAllows, capMessage } from '../../../../../supabase/functions/petro-scan-read/cap.ts';

test('a gamma ray wrapped on a 0 to 150 track with a backup scale unwraps to its true values', () => {
  const truth = Array.from({ length: 60 }, (_, i) => 20 + i * 4.5); // 20 .. 285.5 API
  const traced = truth.map((v) => (v > 150 ? v - 150 : v));
  const { data, wraps } = unwrapBackupScale(traced, { left: 0, right: 150 });
  expect(wraps).toBe(1);
  truth.forEach((v, i) => expect(data[i]).toBeCloseTo(v, 9));
  // and back down again
  const down = [...truth].reverse();
  const r = unwrapBackupScale(down.map((v) => (v > 150 ? v - 150 : v)), { left: 0, right: 150 });
  expect(r.data[0]).toBeCloseTo(down[0] - 150, 9); // the first sample has no history: it stays on the scale it reads
  expect(r.wraps).toBe(1);
});

test('a reversed scale and a logarithmic resistivity scale', () => {
  // a neutron on 0.45 to -0.15: past -0.15 the curve wraps back in from the left
  expect(unwrapBackupScale([0.3, 0.1, -0.1, 0.4, 0.3], { left: 0.45, right: -0.15 }).data[3]).toBeCloseTo(-0.2, 9);
  // 0.2 to 2000 ohm.m; 3000 ohm.m traces as 0.3 on the backup decades
  const r = unwrapBackupScale([500, 1500, 0.3, 0.4], { left: 0.2, right: 2000, log: true });
  expect(r.data[2]).toBeCloseTo(3000, 6);
  expect(r.data[3]).toBeCloseTo(4000, 6);
  expect(unwrapBackupScale([1, NaN, 2], { left: 0, right: 150 }).data[1]).toBeNaN();
});

test('the daily cap: the client and the edge function agree and say so', () => {
  expect(SCAN_USER_DAILY_CAP).toBe(EDGE_CAP);
  expect(kindForStatus(429)).toBe('cap');
  expect(SCAN_READ_MESSAGES.cap).toMatch(/25 scan reads/);
  expect(capAllows(24)).toBe(true);
  expect(capAllows(25)).toBe(false);
  expect(capMessage(25)).toMatch(/used 25 of your 25 scan reads/);
  expect(utcDayStart(new Date('2026-09-29T17:45:00+05:00'))).toBe('2026-09-29T00:00:00.000Z');
  // the function counts and logs its reads under its own name
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', 'petro-scan-read', 'index.ts'), 'utf8');
  expect(src).toMatch(/\.eq\('function_name', SCAN_FUNCTION_NAME\)/);
  expect(src).toMatch(/reply\(429/);
});
