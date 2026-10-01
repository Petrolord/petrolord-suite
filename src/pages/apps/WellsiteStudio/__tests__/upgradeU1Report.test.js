/**
 * @jest-environment node
 *
 * WS-U1-014 and WS-U1-009 (PL7): the daily report PDF is produced by the
 * shipped builder with the real jsPDF and read back with pdftotext: the
 * reviewer lines (well, field, operator, rig, depth reference, KB, preparer,
 * build), a headline depth in the display unit, and the signer by name.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import g from '../../../../../packages/engines/test-data/wellsite/report-day.json';
import { buildReportModel, dailyPeriod } from '@/lib/wellsite/reports';
import { buildReportPdf, docxReport } from '../services/wsExport';

jest.mock('@/lib/pdfBrand', () => ({ drawBrandHeader: () => 30, loadPetrolordLogo: async () => null, fitText: (d, t) => t }));

const tourCfg = { offsetMin: g.offsetMin, tourStartsLocal: g.well.settings.tour_starts_local, reportDayStartLocal: g.well.settings.report_day_start_local };
const model = buildReportModel({ kind: 'daily', period: dailyPeriod(Date.parse('2026-09-07T12:00:00Z'), tourCfg), well: g.well, data: g.data, nowUtcMs: Date.parse(g.nowUtc), offsetMin: g.offsetMin });
const signoff = { id: 's1', user_id: '7b0c2a52-5d1e-4c1b-9a0e-3f2a1b4c5d6e', user_name: 'R. Rigsite', role: 'wellsite_geologist', signed_at: '2026-09-08T05:10:00.000Z', local_offset_min: 60, report_version: 1, content_hash: 'sha256:abc', countersignature: null };
const reviewer = { kbElevM: 25, preparedBy: 'R. Rigsite', build: 'Petrolord Suite 4.0.0 (abc1234), Wellsite Studio' };

const pdfText = (doc) => {
  const f = path.join(os.tmpdir(), `ws-u1-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(f, Buffer.from(doc.output('arraybuffer')));
  try { return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }); } finally { fs.unlinkSync(f); }
};

test('the PDF read back carries the reviewer lines, the depth reference and the signer by name', async () => {
  const text = pdfText(await buildReportPdf(model, { unit: 'ft', offsetMin: 60, signoffs: [signoff], logo: null, reviewer }));
  expect(text).toMatch(/Well KETA-2; field .*; operator .*; rig /);
  expect(text).toMatch(/Depths in ft, measured depth \(MD\) below KB unless marked TVD; KB 82\.0 ft above MSL\./);
  expect(text).toMatch(/Prepared by R\. Rigsite; Petrolord Suite 4\.0\.0 \(abc1234\), Wellsite Studio\./);
  expect(text).toContain('10262 ft');
  expect(text).toContain('Signed by R. Rigsite (wellsite geologist)');
  expect(text).not.toContain(signoff.user_id);
  expect(text).not.toMatch(/[^\x00-\xff]/);
});

test('metric: the same lines in metres; the DOCX carries them too', async () => {
  const text = pdfText(await buildReportPdf(model, { unit: 'm', offsetMin: 60, signoffs: [], logo: null, reviewer }));
  expect(text).toMatch(/Depths in m, measured depth \(MD\) below KB unless marked TVD; KB 25\.0 m above MSL\./);
  const rep = docxReport(model, { unit: 'm', offsetMin: 60, signoffs: [], reviewer });
  expect(rep.meta.join(' ')).toMatch(/KB 25\.0 m above MSL/);
});

test('with no reviewer details the depth reference is still stated and KB reads not set', async () => {
  const text = pdfText(await buildReportPdf(model, { unit: 'ft', offsetMin: 60, signoffs: [], logo: null }));
  // the builder always states the reference now; KB says "not set" when the caller has none
  expect(text).toMatch(/measured depth \(MD\) below KB/);
  expect(text).toMatch(/KB not set/);
});
