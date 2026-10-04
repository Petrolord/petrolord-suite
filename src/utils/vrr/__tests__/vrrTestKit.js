// Cases for the VRR report tests (VRR-U1) and the sample report. Each case
// is a project's inputs, built the way the app builds them: the sample
// ledger through the import door, the sample surveys, a pvt-1 table taken
// from the Fluid test kit, a pattern with an allocation.
import path from 'path';
import { chartLogo } from '@/lib/reportKit/testKit';
import { parseVrrWellCSV, vrrTemplateCSV } from '../csvImport';
import { vrrPvtIntake } from '../pvtIntake';
import { defaultInputs } from '@/contexts/VrrMonitorContext';
import { sampleVRRData } from '@/utils/vrrCalculations';
import { importInfoOf } from '@/components/vrrmonitor/ImportPanel';
import { SAMPLE_SURVEYS } from '@/components/vrrmonitor/PressurePanel';
import { collectVrrReportArgs, buildVrrPdf } from '../vrrReportExport';

export const AT = new Date('2026-10-04T12:00:00Z');
export const BUILD = 'test-build';
export const GOLDEN_DIR = path.join(__dirname, '__fixtures__', 'reportGolden');
export const UPDATE = process.env.UPDATE_REPORT_GOLDENS === '1';
export const logo = chartLogo();

export const IDENT = Object.freeze({
  company: 'Lordsway Energy', field: 'Ekene', licence: 'OML 999', reservoir: 'E-2000', area: 'Central fault block',
  dataSource: 'Monthly production allocation', analyst: 'A. Analyst',
});

export function sampleWells({ system = 'oilfield', surveys = true, ident = true } = {}) {
  const r = parseVrrWellCSV(vrrTemplateCSV());
  return {
    ...defaultInputs(system),
    mode: 'imported',
    wellRows: r.rows,
    importInfo: { kind: 'ledger', file: 'the sample ledger', at: '2026-10-04T10:00:00Z', ...importInfoOf(r, { sample: 'The built-in sample ledger of the app (3 months, 2 producers, 2 injectors; the engine test fixture, not field data).' }) },
    sampleNote: 'The built-in sample ledger of the app (3 months, 2 producers, 2 injectors; the engine test fixture, not field data).',
    pressureSurveys: surveys ? SAMPLE_SURVEYS.map((s) => ({ ...s })) : [],
    identification: ident ? { ...IDENT } : {},
  };
}

export function manualSample() {
  const s = sampleVRRData();
  return {
    ...defaultInputs(),
    periods: s.periods.map((p) => ({ label: p.label, Np: String(p.Np), Wp: String(p.Wp), Gp: String(p.Gp), Wi: String(p.Wi), Gi: String(p.Gi) })),
    sampleNote: 'The built-in 6-month waterflood sample of the app (illustrative volumes, not field data).',
  };
}

export function undatedGrid() {
  return {
    ...defaultInputs(),
    periods: [
      { label: 'Q1', Np: '30000', Wp: '5000', Gp: '30000', Wi: '25000', Gi: '0' },
      { label: 'Q2', Np: '28000', Wp: '8000', Gp: '29000', Wi: '36000', Gi: '0' },
    ],
  };
}

export function fluidBlock() {
  // eslint-disable-next-line global-require
  const { goodOilBlackOil, matched, run } = require('@/components/fluidstudio/__tests__/fluidTestKit');
  const ws = run(matched(goodOilBlackOil()), { projectName: 'Good Oil Well No. 4 PVT', generatedAt: new Date('2026-10-01T09:00:00Z'), appBuild: 'fluid-build' });
  return { ...ws.contract, project_id: 'fluid-1', generated_at: '2026-10-01T09:00:00.000Z', app_build: 'fluid-build' };
}

export function fluidTablePatterns() {
  const taken = vrrPvtIntake(fluidBlock(), { pressurePsia: 2400, at: '2026-10-04T10:00:00Z' });
  const base = sampleWells();
  return {
    ...base,
    pvtMode: 'table',
    pvtIntake: taken.intake,
    fvf: { ...base.fvf, ...taken.constant },
    pressureSurveys: [{ date: '2025-01-15', p_psia: 2600 }, { date: '2025-03-15', p_psia: 2300 }],
    datum: { depth: '8500', reference: 'TVDSS' },
    patterns: [{ id: 'pt_a', name: 'North', producers: ['P-1'] }, { id: 'pt_b', name: 'South', producers: ['P-2'] }],
    allocation: { 'I-1': { 'P-1': '0.6', 'P-2': '0.4' }, 'I-2': { 'P-1': '1' } },
    inputMeta: { Bw: { source: 'lab', note: 'Formation water analysis, 2024' } },
  };
}

export const CASES = Object.freeze({
  'sample-wells': () => sampleWells(),
  'sample-wells-si': () => sampleWells({ system: 'si' }),
  'manual-sample': () => manualSample(),
  'undated-grid': () => undatedGrid(),
  'fluid-table-patterns': () => fluidTablePatterns(),
});

export function reportOf(inputs, { projectName = 'Ekene waterflood', organizationName = '' } = {}) {
  return collectVrrReportArgs({ inputs, projectName, organizationName, build: BUILD });
}

export function pdfOf(inputs, o) {
  const args = reportOf(inputs, o);
  return { args, built: buildVrrPdf(args, { logo, generatedAt: AT }) };
}
