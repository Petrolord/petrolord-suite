// Cases for the EOR Screening report tests (EOR-U1) and the sample report.
// Each case is a project's inputs, built the way the app builds them: the
// built-in sample, a field with sources stated, the same in SI, a project
// that took its PVT from the Fluid test kit (pvt-1), its permeability from
// a Well Test block (wta-1) and its OOIP from a Material Balance record
// (mbal-1), and a blank project.
import path from 'path';
import { chartLogo } from '@/lib/reportKit/testKit';
import { defaultInputs } from '@/contexts/EorScreeningContext';
import { goodOilBlackOil, matched, run } from '@/components/fluidstudio/__tests__/fluidTestKit';
import { eorPvtIntake, eorWtaIntake, eorMbalIntake } from '../intakes';
import { collectEorReportArgs, buildEorPdf } from '../eorReportExport';

export const AT = new Date('2026-10-04T12:00:00Z');
export const TAKEN = '2026-10-04T11:00:00.000Z';
export const BUILD = 'test-build';
export const GOLDEN_DIR = path.join(__dirname, '__fixtures__', 'reportGolden');
export const UPDATE = process.env.UPDATE_REPORT_GOLDENS === '1';
export const logo = chartLogo();

export const IDENT = Object.freeze({
  company: 'Lordsway Energy', field: 'Ekene', licence: 'OML 999', reservoir: 'E-2000 sand', wells: 'EK-3, EK-7', dataDate: '2026-09-30', analyst: 'A. Analyst',
});

export const WTA_BLOCK = Object.freeze({
  contract: 'wta-1',
  app: 'Well Test Analysis Studio',
  project: { id: 'wt-1', name: 'EK-3 buildup', well: 'EK-3', field: 'Ekene' },
  fluid: 'oil',
  permeability: { value: 182.4, kh: 7296, method: 'Horner straight line', ci95: null, window: { from_hr: 2, to_hr: 20, basis: 'shut-in time dt' } },
  skin: { total: 2.1 },
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

export const fluidBlock = () => {
  const ws = run(matched(goodOilBlackOil()), { projectName: 'Good Oil Well No. 4 PVT' });
  return { ...ws.contract, project_id: 'fluid-1' };
};

export function sampleCase({ system = 'oilfield' } = {}) {
  return { ...defaultInputs(system) };
}

export function fieldCase({ system = 'oilfield' } = {}) {
  const i = defaultInputs(system, { sample: false });
  i.form = { gravityApi: '34', viscosityCp: '1.1', oilSatPct: '42', formation: 'sandstone', netThicknessFt: '60', permeabilityMd: '150', depthFt: '7200', temperatureF: '190' };
  i.context = { reservoirPressurePsia: '3150', saturationPressurePsia: '', ooipStb: '' };
  i.depthReference = 'tvdss';
  i.identification = { ...IDENT };
  i.inputMeta = {
    gravityApi: { source: 'lab', note: 'PVT report 2024-11, separator oil' },
    oilSatPct: { source: 'correlation', correlation: 'Material balance remaining oil' },
    permeabilityMd: { source: 'entered', note: 'Core average, EK-3' },
  };
  return i;
}

export function intakeCase({ system = 'oilfield' } = {}) {
  const i = fieldCase({ system });
  const block = fluidBlock();
  const pvt = eorPvtIntake(block, { pressurePsia: 3400, at: TAKEN });
  const wta = eorWtaIntake(WTA_BLOCK, { recordId: 'wt-1', at: TAKEN });
  const mbal = eorMbalIntake(MBAL_RECORD, { at: TAKEN });
  i.form = { ...i.form, ...pvt.patch, ...wta.patch };
  i.context = { ...i.context, ...pvt.context, ...wta.context, ...mbal.context };
  // the last intake taken holds a shared key (pressure: mbal over wta)
  const wtaIntake = { ...wta.intake, fields: wta.intake.fields.filter((f) => f !== 'reservoirPressurePsia'), values: { permeabilityMd: wta.intake.values.permeabilityMd } };
  i.intakes = { pvt: pvt.intake, wta: wtaIntake, mbal: mbal.intake };
  i.inputMeta = { oilSatPct: i.inputMeta.oilSatPct };
  return i;
}

export function blankCase() {
  const i = defaultInputs('oilfield', { sample: false });
  i.identification = { field: 'Unnamed' };
  return i;
}

export const CASES = {
  sample: () => sampleCase(),
  field: () => fieldCase(),
  'field-si': () => fieldCase({ system: 'si' }),
  intakes: () => intakeCase(),
  blank: () => blankCase(),
};

export const reportOf = (inputs, { projectName = 'EOR screening EK' } = {}) => collectEorReportArgs(inputs, { projectName, organizationName: 'Lordsway Energy', build: BUILD });
export const pdfOf = (inputs, o) => {
  const args = reportOf(inputs, o);
  return { args, built: buildEorPdf(args, { logo, generatedAt: AT }) };
};
