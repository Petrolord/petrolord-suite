// Waterflood U1 test kit: a reviewer's case and a bare case as saved
// payloads, derived through the engines the studio calls, and the report
// built from them with the function the Export button calls.
import path from 'path';
import { chartLogo } from '@/lib/reportKit/testKit';
import {
  DEFAULT_DISPLACEMENT, DEFAULT_LAYERS, DEFAULT_LAYERED_CONFIG, DEFAULT_PATTERN, DEFAULT_UNCERTAINTY, DEFAULT_SURVEILLANCE_CONFIG,
  buildDisplacementSpec, buildPatternInputs, buildSurveillanceConfig,
} from '@/contexts/WaterfloodDesignContext';
import { deriveWaterfloodState } from '@/utils/waterflooddesign/workspace';
import { collectWaterfloodReportArgs, buildWaterfloodPdf } from '@/utils/waterflooddesign/reportExport';
import { sampleFractionalFlowData } from '@/utils/fractionalFlowCalculations';
import { samplePatternData } from '@/utils/patternForecastCalculations';
import { sampleLayeredData } from '@/utils/layeredSweepCalculations';
import { sampleWaterfloodRows } from '@/utils/waterfloodCalculations';
import { mapScalKrIntake } from '@/components/waterflooddesign/scalKrIntake';
import { buildScalKrHandoffV2 } from '@/utils/scalstudio/krHandoff';
import { identifiedFitted, stateOf as scalStateOf } from '@/components/scalstudio/__tests__/scalTestKit';
import { goodOilBlackOil, matched, run } from '@/components/fluidstudio/__tests__/fluidTestKit';
import { wfPvtIntake } from '@/utils/waterflooddesign/pvtIntake';
import { WF_PAYLOAD_VERSION } from '@/utils/waterflooddesign/model';

export const AT = new Date('2026-10-04T09:00:00Z');
export const BUILD = 'Petrolord Suite test (fixture)';
export const GOLDEN_DIR = path.join(process.cwd(), 'src', 'components', 'waterflooddesign', '__tests__', '__fixtures__', 'reportGolden');
export const UPDATE = process.env.UPDATE_REPORT_GOLDENS === '1';
export const logo = chartLogo();
export const BUILDERS = { buildDisplacementSpec, buildPatternInputs, buildSurveillanceConfig };

export const IDENT = Object.freeze({
  company: 'Ekene Energy', field: 'Ekene', licence: 'OML 999', reservoir: 'E-2000 sand', pattern: 'Five-spot P-1',
  injectors: 'INJ-1, INJ-2', producers: 'PROD-1, PROD-2', analyst: 'A. Engineer', notes: 'Screening case for the E-2000 waterflood.',
});

/** A bare project: the app's starting values, nothing else. */
export const barePayload = () => ({
  payloadVersion: WF_PAYLOAD_VERSION,
  name: 'Bare',
  displacementInputs: { ...DEFAULT_DISPLACEMENT },
  layers: DEFAULT_LAYERS.map((l) => ({ ...l })),
  layeredConfig: { ...DEFAULT_LAYERED_CONFIG },
  patternInputs: { ...DEFAULT_PATTERN },
  scenarios: [],
  uncertaintyConfig: { ...DEFAULT_UNCERTAINTY },
  surveillance: { rows: [], config: { ...DEFAULT_SURVEILLANCE_CONFIG } },
  identification: {},
  inputMeta: {},
});

/** A reviewer's case: kr from SCAL Studio (kr-1), PVT from Fluid Systems Studio (pvt-1) at 2,500 psia, the samples, a surveillance history, identification. */
export function reviewerPayload({ system = 'oilfield' } = {}) {
  const p = barePayload();
  p.name = 'Ekene P-1 waterflood';
  p.unitSystem = system;
  const s = sampleFractionalFlowData();
  p.displacementInputs = { ...p.displacementInputs, Swc: String(s.params.Swc), Sor: String(s.params.Sor), krwMax: String(s.params.krwMax), kroMax: String(s.params.kroMax), nw: String(s.params.nw), no: String(s.params.no), muW: String(s.muW), muO: String(s.muO) };
  const scal = scalStateOf(identifiedFitted());
  const kr = mapScalKrIntake(buildScalKrHandoffV2({ contract: { ...scal.contract, generated_at: AT.toISOString() }, muW: 0.5, muO: 5 }));
  p.displacementInputs = { ...p.displacementInputs, ...kr.patch, krIntake: { ...kr.patch.krIntake, from: { ...kr.patch.krIntake.from, at: AT.toISOString() } } };
  const fluid = run(matched(goodOilBlackOil()), { projectName: 'Good Oil Well No. 4 PVT' });
  const pvt = wfPvtIntake({ ...fluid.contract, project_id: 'fluid-1' }, { pressurePsia: 2500, at: AT.toISOString() });
  p.displacementInputs = { ...p.displacementInputs, ...pvt.patch.displacement };
  p.patternInputs = { ...p.patternInputs, ...Object.fromEntries(Object.entries(samplePatternData().pattern).map(([k, v]) => [k, String(v)])), ...pvt.patch.pattern, mobilityBasis: 'craig' };
  p.pvtIntake = pvt.intake;
  const l = sampleLayeredData();
  p.layers = l.layers.map((x) => ({ h: String(x.h), k: String(x.k) }));
  p.layeredConfig = { ...p.layeredConfig, M: String(l.M), A: String(l.A) };
  p.surveillance = {
    rows: sampleWaterfloodRows(),
    config: { ...DEFAULT_SURVEILLANCE_CONFIG, ...pvt.patch.surveillance, pressure_basis: 'wellhead' },
    import: { fileName: 'Sample field history (synthetic, built into the app)', sample: true, readAt: AT.toISOString() },
  };
  p.identification = { ...IDENT };
  p.inputMeta = {
    area_acres: { source: 'offset', note: 'Pattern P-1 well spacing' },
    h_ft: { source: 'lab', note: 'Net pay from the petrophysical interpretation' },
    phi: { source: 'lab', note: 'Core porosity, E-2000 average' },
    iw_bpd: { source: 'assumed', note: 'Design injection rate' },
  };
  return p;
}

export const stateOf = (payload) => deriveWaterfloodState(payload, BUILDERS);

export const reportOf = (payload, ctx = {}) => {
  const state = stateOf(payload);
  return { state, ...collectWaterfloodReportArgs({ state, system: payload.unitSystem, projectName: ctx.projectName ?? payload.name, organizationName: 'Org from the profile', build: BUILD }) };
};

export const pdfOf = (args) => buildWaterfloodPdf(args, { logo, generatedAt: AT });
