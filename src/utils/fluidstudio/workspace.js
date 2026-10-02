/**
 * The whole Fluid Systems Studio pipeline from the page state to the report
 * arguments, as one pure call (FLUID-U1). The page runs the same functions
 * memoized piece by piece; tests, the sample report and anything else that
 * needs "what the app would show for these inputs" call this.
 */
import { analyzeFluidSystem } from '@/utils/fluidStudioCalculations';
import { runEosFlash, runEosSeparator, runEosPvtTable } from './eosAnalysis.js';
import { buildFluidPvtContract, buildFluidHandoff } from './pvtHandoff.js';
import { collectFluidReportArgs } from './fluidReportExport.js';
import { identificationOf } from './reportModel.js';

/**
 * @param {object} inputs the page state
 * @param {{projectId?: ?string, projectName?: string, organizationName?: string, build?: string,
 *   system?: string, generatedAt?: Date, envelope?: ?object}} [ctx]
 */
export function runFluidWorkspace(inputs, {
  projectId = null, projectName = '', organizationName = '', build = '', system, generatedAt = new Date(), envelope = null,
} = {}) {
  const results = analyzeFluidSystem(inputs);
  const composition = inputs?.fluidModel === 'eos' ? inputs.streamA?.composition : null;
  const stages = inputs?.separatorTrain?.stages;
  const eos = composition
    ? {
      ...runEosFlash(composition),
      separator: runEosSeparator(composition, stages).separator,
      pvtTable: runEosPvtTable(composition, stages, { salinityPpm: inputs.streamA?.blackOil?.salinity }),
    }
    : null;
  if (!results?.pvt?.kpis) return { inputs, results, eos, contract: null, handoff: null, report: null, system: system || 'oilfield' };
  const sys = system || (inputs.unitSystem === 'si' ? 'si' : 'oilfield');
  const id = identificationOf(inputs);
  const identification = { ...id, company: id.company || organizationName };
  const args = { inputs, results, eos, projectId, projectName: projectName || null, generatedAt, appBuild: build, identification };
  const contract = buildFluidPvtContract(args);
  const handoff = buildFluidHandoff(args);
  const report = collectFluidReportArgs({ inputs, results, eos, envelope, system: sys, projectName, organizationName, build, contract });
  return { inputs, results, eos, contract, handoff, report, system: sys };
}
