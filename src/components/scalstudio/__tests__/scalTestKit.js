/**
 * Shared fixtures of the SCAL Studio upgrade tests (SCAL-U1). Every case is
 * driven through the pipeline the page runs (utils/scalstudio/workspace
 * deriveScalState, the kr-1 writer and the report model); nothing is
 * hand-made in the engine's shape.
 */
import path from 'path';
import { chartLogo } from '@/lib/reportKit/testKit';
import { deriveScalState, inputsFromPayload, DEFAULT_CURVES, DEFAULT_CAPILLARY, DEFAULT_HEIGHT } from '@/utils/scalstudio/workspace';
import { fittedOrigin, EMPTY_IDENTIFICATION } from '@/utils/scalstudio/model';
import { buildScalKrContract } from '@/utils/scalstudio/krHandoff';
import { collectScalReportArgs, buildScalPdf } from '@/utils/scalstudio/scalReportExport';
import { buildDemoSamples } from '@/components/scalstudio/demoSamples';

export const AT = new Date('2026-10-03T09:00:00Z');
export const BUILD = 'Petrolord Suite test (fixture)';
export const GOLDEN_DIR = path.join(process.cwd(), 'src', 'components', 'scalstudio', '__tests__', '__fixtures__', 'reportGolden');
export const UPDATE = process.env.UPDATE_REPORT_GOLDENS === '1';
export const logo = chartLogo();

/** The workspace as the app opens it: starting values, no samples, nothing identified. */
export const openingInputs = () => ({
  curves: JSON.parse(JSON.stringify(DEFAULT_CURVES)),
  samples: [],
  capillary: JSON.parse(JSON.stringify(DEFAULT_CAPILLARY)),
  height: { ...DEFAULT_HEIGHT },
  notes: '',
  identification: { ...EMPTY_IDENTIFICATION },
  inputMeta: {},
  unitSystem: 'oilfield',
});

export const IDENT = Object.freeze({
  company: 'Lordsway Energy', field: 'Ekene', licence: 'OML 143', well: 'Ekene-7', reservoir: 'E-2000 sand',
  interval: '8,440 to 8,500 ft MD', laboratory: 'Core Lab Lagos', labReport: 'SCAL-2026-0117', testDates: '2026-07 to 2026-08',
  analyst: 'A. Analyst', analysisDate: '2026-10-03',
});

/**
 * A reviewer's case: the demo pair (with their pedigree), sample A's Corey
 * fit applied to the Curves tab as the button does, the J averaged from both
 * samples, a FWL, identification and stated sources, the fw preview on.
 */
export function identifiedFitted({ system = 'oilfield' } = {}) {
  const inputs = openingInputs();
  inputs.unitSystem = system;
  inputs.identification = { ...IDENT };
  inputs.samples = buildDemoSamples().map((s, i) => ({ ...s, id: `demo-${i}`, laboratory: 'Core Lab Lagos', labReport: 'SCAL-2026-0117', testTempF: '150' }));
  const derived = deriveScalState(inputs);
  const a = derived.samplesDerived[0];
  const p = a.krFit.params;
  const applied = { Swc: p.Swc.toFixed(3), Sor: p.Sor.toFixed(3), krwMax: p.krwMax.toPrecision(4), kroMax: p.kroMax.toPrecision(4), nw: p.nw.toFixed(2), no: p.no.toFixed(2) };
  inputs.curves = { ...inputs.curves, ow: applied, owOrigin: fittedOrigin({ sample: a, fit: a.krFit, applied, at: AT.toISOString() }), fwPreviewOn: true };
  inputs.capillary = { ...inputs.capillary, jMode: 'samples', includedSampleIds: inputs.samples.map((s) => s.id), SwirrOverride: '0.12' };
  inputs.height = { ...inputs.height, fwl_tvdss: '8600' };
  inputs.inputMeta = {
    go: { source: 'offset', note: 'Ekene-3 gas-oil SCAL, report SCAL-2025-0031' },
    k_md: { source: 'lab', note: 'Core-log permeability, average of the E-2000 sand' },
    phi: { source: 'lab', note: 'Core porosity, E-2000 average' },
    sigma: { source: 'correlation', correlation: 'Oil-brine IFT at reservoir temperature' },
    theta: { source: 'assumed', note: 'Water-wet, 30 degrees' },
    gammaW: { source: 'lab', note: 'Formation water analysis' },
    gammaHc: { source: 'lab', note: 'PVT report, oil density at reservoir conditions' },
    fwl: { source: 'offset', note: 'Ekene-3 pressure gradients' },
    mu: { source: 'lab', note: 'PVT report at 3,000 psia' },
  };
  return inputs;
}

/** The studio state of a case, as the provider derives it, with its kr-1 block. */
export function stateOf(inputs, { projectId = 'scal-project-1', projectName = 'Ekene E-2000 SCAL' } = {}) {
  const s = deriveScalState(inputs);
  s.contract = buildScalKrContract({ ...s, projectId, projectName, build: BUILD, generatedAt: AT });
  return s;
}

export const reportOf = (inputs, ctx = {}) => {
  const state = stateOf(inputs, ctx);
  return { state, ...collectScalReportArgs({ state, system: inputs.unitSystem, projectName: ctx.projectName ?? 'Ekene E-2000 SCAL', organizationName: 'Org from the profile', build: BUILD }) };
};

export const pdfOf = (rep) => buildScalPdf(rep, { logo, generatedAt: AT });

export { inputsFromPayload };
