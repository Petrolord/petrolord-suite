// WF-U1 (PL5): a project saved by an earlier release opens with the numbers
// it was computed with (the endpoint mobility ratio), says so, and reports n/a
// for what it never had. A new project uses Craig's M.
import { migrateWaterfloodPayload, WF_PAYLOAD_VERSION } from '@/utils/waterflooddesign/model';
import { arealSweepAtBreakthrough } from '@/utils/patternForecastCalculations';
import { V1_PAYLOAD } from '@/components/waterflooddesign/__fixtures__/savedProjects';
import { DEFAULT_PATTERN } from '@/contexts/WaterfloodDesignContext';
import { reportOf, pdfOf } from './wfTestKit';
import { readPdf, flat } from '@/lib/reportKit/testKit';

it('a version 1 project keeps the endpoint basis and its EA at breakthrough', () => {
  const p = migrateWaterfloodPayload(JSON.parse(JSON.stringify(V1_PAYLOAD)));
  expect(p.payloadVersion).toBe(WF_PAYLOAD_VERSION);
  expect(p.migratedFrom).toBe(1);
  expect(p.patternInputs.mobilityBasis).toBe('endpoint');
  const r = reportOf(p);
  expect(r.state.patternResult.summary.EAbt).toBeCloseTo(arealSweepAtBreakthrough(4), 12);
  const text = flat(readPdf(pdfOf(r).doc).text);
  expect(text).toMatch(/kept from a project saved before October 2026/);
  expect(text).toMatch(/The areal sweep was entered with the endpoint mobility ratio/);
  expect(text).toMatch(/Analyst n\/a/);
  expect(text).toMatch(/Does not apply: no surveillance history was loaded/);
});

it('a version 2 payload is not migrated; a new project uses Craig', () => {
  const v2 = { payloadVersion: 2, patternInputs: { mobilityBasis: 'craig' } };
  expect(migrateWaterfloodPayload(v2)).toBe(v2);
  expect(DEFAULT_PATTERN.mobilityBasis).toBe('craig');
});
