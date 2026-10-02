/**
 * Shared fixtures of the Fluid Systems Studio upgrade tests (FLUID-U1).
 * Every case is driven through the pipeline the page runs
 * (utils/fluidstudio/workspace runFluidWorkspace); nothing is hand-made in
 * the engine's shape.
 */
import path from 'path';
import { sampleFluidStudioData } from '@/utils/fluidStudioCalculations';
import { runFluidWorkspace } from '@/utils/fluidstudio/workspace';
import { buildFluidPdf } from '@/utils/fluidstudio/fluidReportExport';
import { sampleInputMeta, emptyIdentification } from '@/utils/fluidstudio/reportModel';
import { labTuneRequest, tuneRecord, envelopeRequest } from '@/utils/fluidstudio/eosAnalysis';
import { envelopeKey } from '@/utils/fluidstudio/reportFigures';
import { createEnvelopeClient } from '@/utils/fluidstudio/envelopeClient';
import { chartLogo } from '@/lib/reportKit/testKit';

export const AT = new Date('2026-10-02T09:00:00Z');
export const BUILD = 'Petrolord Suite test (fixture)';
export const GOLDEN_DIR = path.join(process.cwd(), 'src', 'components', 'fluidstudio', '__tests__', '__fixtures__', 'reportGolden');
export const UPDATE = process.env.UPDATE_REPORT_GOLDENS === '1';
export const logo = chartLogo();

/** The workspace as the app opens it (sample fluid, sample marks, blank identification). */
export const sampleWorkspace = () => ({ ...sampleFluidStudioData(), identification: emptyIdentification(), inputMeta: sampleInputMeta() });

export const IDENT = Object.freeze({
  company: 'Lordsway Energy', field: 'Ekene', licence: 'OML 143', well: 'Ekene-7', reservoir: 'E-2000 sand',
  sampleName: 'BHS-2 oil', sampleDepth: '9,850 ft MD below KB', sampleDate: '2026-08-14', samplingMethod: 'Bottomhole',
  laboratory: 'Core Lab Lagos', labReport: 'RFL-2026-0412', analyst: 'A. Analyst', analysisDate: '2026-10-02',
});

/** A black-oil project a reviewer would see: identified, with stated sources. */
export function identifiedBlackOil() {
  const inputs = sampleWorkspace();
  inputs.identification = { ...IDENT };
  inputs.inputMeta = {
    api: { source: 'lab', note: 'Stock-tank oil, report RFL-2026-0412' },
    gor: { source: 'lab', note: 'Separator test 2' },
    gasSg: { source: 'correlation', correlation: 'Separator gas analysis, weighted' },
    temp: { source: 'offset', note: 'Ekene-3 static survey' },
    salinity: { source: 'assumed' },
  };
  return inputs;
}

/** The compositional sample above its bubble point, with lab values to tune to. */
export function eosWithLab() {
  const inputs = sampleWorkspace();
  inputs.fluidModel = 'eos';
  inputs.identification = { ...IDENT, sampleName: 'BHS-2 recombined' };
  inputs.inputMeta = { composition: { source: 'lab', note: 'Report RFL-2026-0412, table 3' }, plus: { source: 'lab' }, flash: { source: 'offset', note: 'Ekene-3 static survey' } };
  inputs.streamA.composition = {
    ...inputs.streamA.composition,
    pressure: 3500,
    tuning: { lab: { psatPsia: 2750, psatTF: null, totalGor: 830, stoApi: null, bo: 1.46 }, applied: null },
  };
  return inputs;
}

/** Run the app's own regression (the envelope client's synchronous path) and apply it as the card does. */
export async function tune(inputs) {
  const composition = inputs.streamA.composition;
  const stages = inputs.separatorTrain.stages;
  const { request, reasons } = labTuneRequest(composition, stages);
  if (!request) throw new Error(`no tune request: ${reasons.join(' ')}`);
  const client = createEnvelopeClient();
  const fit = await client.tune(request);
  client.dispose();
  if (!fit.ok) throw new Error(fit.reason);
  return {
    ...inputs,
    streamA: { ...inputs.streamA, composition: { ...composition, tuning: { ...composition.tuning, applied: fit.tuning, fittedOn: JSON.stringify(request), fit: tuneRecord(fit, composition, AT) } } },
  };
}

/** Trace the envelope as the card does and hold it as the page does. */
export async function traceEnvelope(inputs) {
  const composition = inputs.streamA.composition;
  const client = createEnvelopeClient();
  const result = await client.trace(envelopeRequest(composition));
  client.dispose();
  return { result, requestKey: envelopeKey(composition) };
}

export const run = (inputs, ctx = {}) => runFluidWorkspace(inputs, {
  projectId: 'fluid-project-1', projectName: 'Ekene E-2000 PVT', organizationName: 'Org from the profile', build: BUILD, generatedAt: AT, ...ctx,
});

export const pdfOf = (ws) => buildFluidPdf(ws.report, { logo, generatedAt: AT });
