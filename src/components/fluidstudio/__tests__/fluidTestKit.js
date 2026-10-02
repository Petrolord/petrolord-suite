/**
 * Shared fixtures of the Fluid Systems Studio upgrade tests (FLUID-U1).
 * Every case is driven through the pipeline the page runs
 * (utils/fluidstudio/workspace runFluidWorkspace); nothing is hand-made in
 * the engine's shape.
 */
import fs from 'fs';
import path from 'path';
import { sampleFluidStudioData } from '@/utils/fluidStudioCalculations';
import { runFluidWorkspace } from '@/utils/fluidstudio/workspace';
import { buildFluidPdf } from '@/utils/fluidstudio/fluidReportExport';
import { sampleInputMeta, emptyIdentification } from '@/utils/fluidstudio/reportModel';
import { labTuneRequest, tuneRecord, envelopeRequest } from '@/utils/fluidstudio/eosAnalysis';
import { envelopeKey } from '@/utils/fluidstudio/reportFigures';
import { createEnvelopeClient } from '@/utils/fluidstudio/envelopeClient';
import { chartLogo } from '@/lib/reportKit/testKit';
import { readLabTable, labTableOf, emptyLabData } from '@/utils/fluidstudio/labData';

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

// ---- FLUID-U2: a fluid with a published laboratory study behind it -----------

export const LAB_DIR = path.join(process.cwd(), 'e2e', 'fixtures', 'fluid-systems', 'lab');
export const labFile = (name) => fs.readFileSync(path.join(LAB_DIR, name), 'utf8');

/** The three tables of the Good Oil Co. Well No. 4 study, read at the door as the app reads them. */
export function goodOilLabData({ separator = true } = {}) {
  const table = (file, name) => labTableOf(readLabTable(labFile(file)), { name, tempF: 220, at: AT });
  return {
    ...emptyLabData(),
    cce: table('good-oil-cce-spaces.txt', 'good-oil-cce-spaces.txt'),
    dl: table('good-oil-dl-twin.csv', 'good-oil-dl-twin.csv'),
    viscosity: table('good-oil-viscosity.csv', 'good-oil-viscosity.csv'),
    dlBasis: 'differential',
    separatorTest: separator ? { bofb: 1.474, rsfb: 768 } : { bofb: null, rsfb: null },
  };
}

export const GOOD_OIL_IDENT = Object.freeze({
  company: 'Good Oil Company', field: 'Productive', licence: 'Samson County, Texas', well: 'Oil Well No. 4', reservoir: 'Cretaceous',
  sampleName: 'Subsurface sample', sampleDepth: '8,500 ft', sampleDate: '', samplingMethod: 'Bottomhole',
  laboratory: 'Core Laboratories', labReport: 'RFL 88001', analyst: 'A. Analyst', analysisDate: '2026-10-02',
});

/**
 * Good Oil Co. Well No. 4 as a black-oil project: the stock-tank gravity,
 * total GOR and separator of the optimum separator test (100 psig and 75
 * degF), the reservoir temperature of the study, the gas gravity Ahmed
 * tabulates for it (Example 2-18, oil 2), and the laboratory tables.
 */
export function goodOilBlackOil(opts = {}) {
  const inputs = sampleWorkspace();
  inputs.identification = { ...GOOD_OIL_IDENT };
  inputs.streamA.blackOil = { api: 40.7, gor: 768, gasSg: 0.855, temp: 220, pb: null, salinity: 35000 };
  inputs.separatorTrain = { stages: [{ pressure: 114.7, temperature: 75, enabled: true }] };
  inputs.ptProfile = { raw: '' };
  inputs.inputMeta = {
    api: { source: 'lab', note: 'Separator test, report RFL 88001 page 9' },
    gor: { source: 'lab', note: 'Separator test at 100 psig and 75 degF' },
    gasSg: { source: 'lab', note: 'Gas gravity of the study as tabulated by Ahmed' },
    temp: { source: 'lab', note: 'Reservoir temperature of the study' },
    salinity: { source: 'assumed' },
    separator: { source: 'lab', note: 'Optimum separator test' },
  };
  inputs.labData = goodOilLabData(opts);
  return inputs;
}
