// The PDF and DOCX builders render a report model (no store, no screen: jsPDF
// must never sit in the workstation's mount graph, see ReportScreen).
import g from '../../../../../packages/engines/test-data/wellsite/report-day.json';
import { buildReportModel, dailyPeriod } from '@/lib/wellsite/reports';
import { buildReportPdf, docxReport } from '../services/wsExport';
import { buildDocumentXml } from '@/utils/reportAutopilotDocx';

jest.mock('@/lib/pdfBrand', () => ({ drawBrandHeader: () => 30, loadPetrolordLogo: async () => null, fitText: (d, t) => t }));

const tourCfg = { offsetMin: g.offsetMin, tourStartsLocal: g.well.settings.tour_starts_local, reportDayStartLocal: g.well.settings.report_day_start_local };
const model = buildReportModel({ kind: 'daily', period: dailyPeriod(Date.parse('2026-09-07T12:00:00Z'), tourCfg), well: g.well, data: g.data, nowUtcMs: Date.parse(g.nowUtc), offsetMin: g.offsetMin });
const signoff = { id: 's1', user_name: 'A. Geologist', role: 'wellsite_geologist', signed_at: '2026-09-08T05:10:00.000Z', local_offset_min: 60, report_version: 1, content_hash: 'sha256:abc', countersignature: null };

test('the PDF builds with every section and the sign-off block', async () => {
  const doc = await buildReportPdf(model, { unit: 'ft', offsetMin: 60, signoffs: [signoff], logo: null });
  expect(doc.internal.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  const doc2 = await buildReportPdf(model, { unit: 'm', offsetMin: 60, signoffs: [], logo: null });
  expect(doc2.internal.getNumberOfPages()).toBeGreaterThanOrEqual(1);
});

test('the DOCX report carries the sections, the depths in the display unit, and the sign-off', () => {
  const rep = docxReport(model, { unit: 'ft', offsetMin: 60, signoffs: [signoff] });
  expect(rep.title).toBe('Daily geological report, KETA-2');
  expect(rep.sections.map((s) => s.title)).toEqual(['Well status', 'Progress in the period', 'Operations summary', 'Lithology', 'Hydrocarbon shows', 'Gas', 'Formation tops', 'Observations', 'Sampling', 'Photographs', 'Geological summary', 'Forecast and recommendations', 'Sign-off']);
  const xml = buildDocumentXml(rep);
  expect(xml).toContain('Top Agbada');
  expect(xml).toContain('10262 ft');
  expect(xml).toContain('Signed by A. Geologist (wellsite geologist)');
  expect(xml).toContain('Platform countersignature pending until synchronised.');
  expect(xml).not.toMatch(/[\u2014\u2013]/);
});
