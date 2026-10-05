// Cases for the Well Spacing report tests (WS-U1) and the sample report.
// Each case is a project's inputs, built the way the app builds them: the
// built-in sample, a field with sources stated and its identification, the
// same in SI, a project that took its PVT from the Fluid test kit (pvt-1),
// its permeability and skin from a Well Test block (wta-1), its OOIP from a
// Material Balance record (mbal-1), a well EUR from a DCA contract
// (dca-forecast-1) and wells from the registry, and a blank project.
import path from 'path';
import { chartLogo } from '@/lib/reportKit/testKit';
import { goodOilBlackOil, matched, run } from '@/components/fluidstudio/__tests__/fluidTestKit';
import { evaluateSpacingCases, validateInputs } from '@/utils/wellSpacingCalculations';
import { defaultInputs } from '../model';
import { wsPvtIntake, wsWtaIntake, wsMbalIntake, wsDcaIntake, wsWellsIntake } from '../intakes';
import { collectWellSpacingReportArgs, buildWellSpacingPdf } from '../reportExport';

export const AT = new Date('2026-10-05T12:00:00Z');
export const TAKEN = '2026-10-05T11:00:00.000Z';
export const BUILD = 'test-build';
export const GOLDEN_DIR = path.join(__dirname, '__fixtures__', 'reportGolden');
export const UPDATE = process.env.UPDATE_REPORT_GOLDENS === '1';
export const logo = chartLogo();

export const IDENT = Object.freeze({
  company: 'Lordsway Energy', field: 'Ekene', licence: 'OML 999', reservoir: 'E-2000 sand', wells: 'EK-1 to EK-4', dataDate: '2026-09-30', analyst: 'A. Analyst',
});

export const WTA_BLOCK = Object.freeze({
  contract: 'wta-1',
  app: 'Well Test Analysis Studio',
  project: { id: 'wt-1', name: 'EK-3 buildup', well: 'EK-3', field: 'Ekene' },
  fluid: 'oil',
  permeability: { value: 182.4, kh: 7296, method: 'Horner straight line', ci95: null, window: { from_hr: 2, to_hr: 20, basis: 'shut-in time dt' } },
  skin: { total: 2.1, mechanical: 1.4, partial_penetration: 0.7, method: 'Horner straight line', apparent: false, withheld: null },
  pressure: { initial_psia: 4100, p_star_psia: 3985, average_psia: 3985, average_method: 'Extrapolated p* of the Horner straight line.', basis: 'absolute, at the gauge depth (no correction to a datum)' },
  temperature_degF: 205,
  status: { match: 'semilog', converged: null, note: null },
  computed_at: '2026-10-03T09:00:00.000Z',
});

export const MBAL_RECORD = Object.freeze({
  contract: 'mbal-1',
  app: 'Material Balance Studio',
  case: { id: 'rb-1', name: 'Ekene E-2000', field: 'Ekene', reservoir: 'E-2000', fluid_system: 'oil' },
  run: { id: 'run-1', ran_at: '2026-10-02T15:00:00Z', engine_version: 'v28' },
  in_place: { quantity: 'OOIP', value: 152000000, unit: 'STB', method: 'Havlena-Odeh regression, slope', r_squared: 0.987, points: 12, ci95: null },
  pressure: { initial_psia: 4100, last_psia: 3420, last_date: '2026-06-30', basis: 'absolute, as entered (no datum correction)', series: [] },
  status: 'current',
});

export const DCA_CONTRACT = Object.freeze({
  schema: 'dca-forecast-1',
  app: 'Decline Curve Analysis',
  table: 'saved_dca_projects',
  projectId: 'dca-1',
  projectName: 'Ekene decline',
  projectSavedAt: '2026-10-01T08:00:00.000Z',
  source: { kind: 'well', wellId: 'w-ek2', wellName: 'EK-2', sample: false },
  stream: 'oil',
  units: { rate: 'bbl/d', volume: 'bbl', time: 'day' },
  decline: { model: 'hyperbolic', qi: 900, qiAt: '2022-01-01', diPerDay: 0.0009, diNominalPctPerYear: 32.9, b: 0.6 },
  atCutoff: { date: '2026-06-30', rate: 310, diPerDay: 0.0004, diNominalPctPerYear: 14.6 },
  fit: { fittedAt: '2026-09-30T10:00:00.000Z' },
  forecast: { start: '2026-07-01', economicLimit: 10, horizonDays: 10957, endReason: 'economic-limit', produced: 820000, remaining: 1250000, eur: 2070000 },
  fingerprint: 'abc123',
});

// four wells on a 1,320 ft square (a 40-acre square grid), in ft
export const REGISTRY_WELLS = Object.freeze([
  { id: 'gw-1', name: 'EK-1', surface_x: 500000, surface_y: 300000, xy_unit: 'ft', crs: 'EPSG:26191' },
  { id: 'gw-2', name: 'EK-2', surface_x: 501320, surface_y: 300000, xy_unit: 'ft', crs: 'EPSG:26191' },
  { id: 'gw-3', name: 'EK-3', surface_x: 500000, surface_y: 301320, xy_unit: 'ft', crs: 'EPSG:26191' },
  { id: 'gw-4', name: 'EK-4', surface_x: 501320, surface_y: 301320, xy_unit: 'ft', crs: 'EPSG:26191' },
]);

export const fluidBlock = () => {
  const ws = run(matched(goodOilBlackOil()), { projectName: 'Good Oil Well No. 4 PVT' });
  return { ...ws.contract, project_id: 'fluid-1' };
};

export function sampleCase({ system = 'oilfield' } = {}) {
  return defaultInputs(system, { sample: true });
}

export function fieldCase({ system = 'oilfield' } = {}) {
  const i = defaultInputs(system, { sample: true });
  i.sampleNote = null;
  i.identification = { ...IDENT };
  i.form = { ...i.form, fieldName: 'Ekene', latitude: '5.21', longitude: '6.43', porosity: '18', oilFvf: '1.32', wellLayout: 'triangular' };
  i.inputMeta = {
    porosity: { source: 'lab', note: 'Core report CR-17, 42 plugs' },
    oilFvf: { source: 'lab', note: 'PVT report 2024-11, differential liberation adjusted to separator' },
    recoveryFactor: { source: 'offset', note: 'Analog: E-1000 sand, same field' },
  };
  return i;
}

/** The project after taking each intake as the app does (the last intake taken owns a value). */
export function intakeCase({ system = 'oilfield' } = {}) {
  const i = defaultInputs(system, { sample: false });
  i.identification = { ...IDENT };
  i.form = { ...i.form, ...defaultInputs('oilfield', { sample: true }).form, fieldName: 'Ekene', reservoirPressure: '3400' };
  const take = (res) => {
    if (!res.ok) throw new Error(res.errors.join(' '));
    i.form = { ...i.form, ...res.patch };
    i.context = { ...i.context, ...res.context };
    i.intakes = { ...i.intakes, [res.intake.kind]: res.intake };
  };
  take(wsPvtIntake(fluidBlock(), { pressurePsia: 3400, at: TAKEN }));
  take(wsWtaIntake(WTA_BLOCK, { recordId: 'wt-1', recordName: 'EK-3 buildup', at: TAKEN }));
  // the average pressure the Well Test gives moved the pressure; re-read the PVT at it, as the card asks
  take(wsPvtIntake(fluidBlock(), { pressurePsia: Number(i.form.reservoirPressure), at: TAKEN }));
  take(wsMbalIntake(MBAL_RECORD, { at: TAKEN }));
  take(wsDcaIntake(DCA_CONTRACT, { at: TAKEN }));
  take(wsWellsIntake(REGISTRY_WELLS, { at: TAKEN }));
  return i;
}

export function blankCase({ system = 'oilfield' } = {}) {
  return defaultInputs(system, { sample: false });
}

export const CASES = { sample: sampleCase, field: fieldCase, 'field-si': () => fieldCase({ system: 'si' }), intakes: intakeCase, blank: blankCase };

/** The results the page computes: null when the inputs do not validate. */
export async function resultsOf(inputs) {
  if (!validateInputs(inputs.form).ok) return null;
  return evaluateSpacingCases(inputs.form);
}

export async function reportOf(inputs, opts = {}) {
  const results = await resultsOf(inputs);
  return { results, ...collectWellSpacingReportArgs(inputs, { results, projectName: 'Spacing study', organizationName: 'Org Name', build: BUILD, ...opts }) };
}

export async function pdfOf(inputs, opts = {}) {
  const args = await reportOf(inputs, opts);
  const built = buildWellSpacingPdf(args, { logo, generatedAt: AT });
  return { args, built };
}
