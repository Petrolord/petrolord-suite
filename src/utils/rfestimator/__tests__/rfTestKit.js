// Recovery Factor U1 test kit: saved payloads (sample, reviewer, gas), the
// state derived through the functions the page calls, and the report built
// with the function the Export button calls.
import path from 'path';
import { chartLogo } from '@/lib/reportKit/testKit';
import { RF_PAYLOAD_VERSION, sampleInputs, migrateRfPayload, inputsFromPayload } from '@/utils/rfestimator/model';
import { deriveRf } from '@/utils/rfestimator/workspace';
import { collectRfReportArgs, buildRfPdf } from '@/utils/rfestimator/reportExport';
import { rfPvtIntake } from '@/utils/rfestimator/pvtIntake';
import { goodOilBlackOil, run } from '@/components/fluidstudio/__tests__/fluidTestKit';

export const AT = new Date('2026-10-04T09:00:00Z');
export const BUILD = 'Petrolord Suite test (fixture)';
export const GOLDEN_DIR = path.join(process.cwd(), 'src', 'utils', 'rfestimator', '__tests__', '__fixtures__', 'reportGolden');
export const UPDATE = process.env.UPDATE_REPORT_GOLDENS === '1';
export const logo = chartLogo();

export const IDENT = Object.freeze({
  company: 'Ekene Energy', field: 'Ekene', licence: 'OML 999', reservoir: 'E-2000 sand', wells: 'E-1, E-2, E-3',
  analyst: 'A. Engineer', dataDate: '2026-09-30', notes: 'Screening case for the E-2000 sand ahead of the reserves review.',
});

/** The sample as a new project saves it. */
export const samplePayload = () => ({ payloadVersion: RF_PAYLOAD_VERSION, name: 'Sample', inputs: sampleInputs(), identification: {}, inputMeta: {} });

export const goodOilContract = () => ({ ...run(goodOilBlackOil(), { projectName: 'Good Oil Well No. 4 PVT' }).contract, project_id: '00000079-0000-4000-8000-000000000000' });

/** A reviewer's oil case: API water drive, PVT from a Fluid project, sources stated, identified. */
export function reviewerPayload({ system = 'oilfield' } = {}) {
  const inputs = { ...sampleInputs(), origin: 'entered', method: 'api_water_drive', driveCode: 'water_drive' };
  inputs.vol = { area: '1200', thickness: '45', phi: '0.22', sw: '0.28', ntg: '0.85', boi: '1.3', bgi: '0.005' };
  inputs.corr = { ...inputs.corr, k: '150', muwi: '0.5', pi: '4200', pa: '1500' };
  const pvt = rfPvtIntake(goodOilContract(), { phase: 'oil', piPsia: 4200, paPsia: 1500, at: AT.toISOString() });
  if (!pvt.ok) throw new Error(pvt.errors.join(' '));
  inputs.corr = { ...inputs.corr, ...pvt.patch.corr };
  inputs.vol = { ...inputs.vol, ...pvt.patch.vol };
  return {
    payloadVersion: RF_PAYLOAD_VERSION,
    name: 'Ekene E-2000 RF',
    unitSystem: system,
    inputs,
    identification: { ...IDENT },
    inputMeta: {
      'vol.area': { source: 'offset', note: 'Top structure map, 2026 reprocessing' },
      'vol.thickness': { source: 'lab', note: 'Net pay from Petrophysics, E-1 to E-3' },
      'vol.phi': { source: 'lab', note: 'Core-calibrated log average' },
      'vol.sw': { source: 'correlation', correlation: 'Archie' },
      'vol.ntg': { source: 'assumed' },
      'corr.phi': { source: 'lab' },
      'corr.swi': { source: 'correlation', correlation: 'Archie' },
      'corr.k': { source: 'lab', note: 'Core plug geometric mean' },
    },
    pvtIntake: pvt.intake,
  };
}

/** A volumetric gas case on p/z depletion. */
export function gasPayload() {
  const inputs = { ...sampleInputs(), origin: 'entered', phase: 'gas', method: 'gas_pz', driveCode: 'gas_volumetric', zMethod: 'typed' };
  inputs.vol = { area: '2500', thickness: '60', phi: '0.18', sw: '0.25', ntg: '0.9', boi: '1.3', bgi: '0.0045' };
  inputs.corr = { ...inputs.corr, pi: '4000', zi: '0.9', pa: '800', za: '0.95' };
  return { payloadVersion: RF_PAYLOAD_VERSION, name: 'Gas p/z', inputs, identification: { field: 'Ekene', reservoir: 'G-1 gas' }, inputMeta: {} };
}

/** The estimator state of a payload, as the provider derives it. */
export function stateOf(payload) {
  const p = migrateRfPayload(payload);
  const inputs = inputsFromPayload(p);
  return {
    payload: p,
    state: {
      inputs,
      derived: deriveRf(inputs, { inPlaceIntake: p.inPlaceIntake || null, pvtIntake: p.pvtIntake || null }),
      identification: p.identification || {},
      inputMeta: p.inputMeta || {},
      pvtIntake: p.pvtIntake || null,
      inPlaceIntake: p.inPlaceIntake || null,
      migration: p.migratedFrom ? { from: p.migratedFrom, note: p.apiBasisNote || null } : null,
    },
  };
}

export function reportOf(payload, { organizationName = '' } = {}) {
  const { state, payload: p } = stateOf(payload);
  const args = collectRfReportArgs({ state, system: p.unitSystem || 'oilfield', projectName: p.name, organizationName, build: BUILD });
  return { ...args, state };
}

export const pdfOf = (r) => buildRfPdf(r, { logo, generatedAt: AT });
