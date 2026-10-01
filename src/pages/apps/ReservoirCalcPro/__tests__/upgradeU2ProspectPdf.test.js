/**
 * @jest-environment node
 *
 * ReservoirCalc Pro upgrade U2-011: the one-page prospect summary, built
 * by the shipped generator with the real jsPDF and read back with
 * pdftotext (PL7).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { buildProspectSummaryPdf, prospectSummaryRows } from '../services/prospectSummaryPdf';
import { reviewerLines } from '../services/reportInfo';

jest.setTimeout(120000);
beforeAll(() => { global.fetch = () => Promise.reject(new Error('no network in jest')); });

const pdfText = (doc) => {
  const f = path.join(os.tmpdir(), `rcp-u2-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(f, Buffer.from(doc.output('arraybuffer')));
  try {
    const pages = execFileSync('pdfinfo', [f], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/)[1];
    return { text: execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }), pages: Number(pages) };
  } finally { fs.unlinkSync(f); }
};

const prospect = {
  name: 'Keta East — φ sand', factors: { trap: 0.6, reservoir: 0.7, charge: 0.8, seal: 0.7 },
  unrisked: { mean: 42.5, p90: 18.2, p50: 37.9, p10: 71.4 }, unit: 'MMSTB', basis: 'recoverable',
  projectName: 'Keta Project',
  reviewer: reviewerLines({ report: { field: 'Keta', analyst: 'A. Analyst' }, unitSystem: 'field', inputMethod: 'hybrid', fluidType: 'oil', inputs: { owc: -8000 }, now: new Date('2026-10-01T09:00:00Z'), build: 'Petrolord Suite 4.0.0 (abc1234)' }),
};

test('one page: reviewer header, Pg factors, success-case and risked volumes, signature block', async () => {
  const doc = await buildProspectSummaryPdf(prospect);
  const { text, pages } = pdfText(doc);
  expect(pages).toBe(1);
  expect(text).toMatch(/Prospect summary: Keta East - phi sand/);
  expect(text).toMatch(/Field: Keta \| Analyst: A\. Analyst \| Date: 2026-10-01 \| Petrolord Suite 4\.0\.0 \(abc1234\)/);
  expect(text).toMatch(/Contacts \(TVDSS elevation, negative below datum\): OWC -8,000 ft/);
  // Pg = 0.6 x 0.7 x 0.8 x 0.7 = 0.2352
  expect(text).toMatch(/Pg \(product\)\s+23\.5%/);
  expect(text).toMatch(/Volumes \(recoverable, prospective resources\), MMSTB/);
  expect(text).toMatch(/P90 \(low\)\s+18\.20\s+n\/a/);
  expect(text.replace(/\s+/g, ' ')).toMatch(/P90 is exceeded with 90 percent probability/);
  // risked mean = 0.2352 x 42.5 = 9.996
  expect(text).toMatch(/Mean\s+42\.50\s+10\.00/);
  expect(text).toMatch(/risked percentiles are not quoted/);
  expect(text).toMatch(/Prepared by\s+Reviewed by\s+Approved by/);
  expect(text).not.toMatch(/[φ—−•]/);
});

test('the rows the page prints come from the risk engine (negative control: an in-place basis is said)', async () => {
  const rows = prospectSummaryRows(prospect);
  expect(rows.risked.riskedMean).toBeCloseTo(0.2352 * 42.5, 10);
  expect(rows.volRows[0][2]).toBe('n/a'); // no risked P90
  const doc = await buildProspectSummaryPdf({ ...prospect, basis: 'in-place' });
  const { text } = pdfText(doc);
  expect(text).toMatch(/Volumes \(in place\)/);
  expect(text).toMatch(/These are in-place volumes/);
});
