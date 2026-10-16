// The seismic worker's handlers that run in the browser: the post-stack
// kinds whose inputs and outputs are volumes (router.BROWSER_KINDS). The
// files are imported from worker/seismic-worker as they are, so the browser
// runs the server's code. Kinds that read raw SEG-Y or prestack gathers stay
// on the server or wait for Petrolord Local (L2).

import { attributeVolume } from '../../../../worker/seismic-worker/src/handlers/attributeVolume.js';
import { seismicQc } from '../../../../worker/seismic-worker/src/handlers/seismicQc.js';
import { poststackInversion } from '../../../../worker/seismic-worker/src/handlers/poststackInversion.js';
import { propertyPrediction } from '../../../../worker/seismic-worker/src/handlers/propertyPrediction.js';
import { sampleVolumes } from '../../../../worker/seismic-worker/src/handlers/sampleVolumes.js';
import { avoVolumes } from '../../../../worker/seismic-worker/src/handlers/avoVolumes.js';
import { matchStacksJob } from '../../../../worker/seismic-worker/src/handlers/matchStacks.js';
import { balanceStacksJob } from '../../../../worker/seismic-worker/src/handlers/balanceStacks.js';
import { prestackInversion } from '../../../../worker/seismic-worker/src/handlers/prestackInversion.js';
import { zoneMaps } from '../../../../worker/seismic-worker/src/handlers/zoneMaps.js';
import { JobFailure } from '../../../../worker/seismic-worker/src/runJob.js';
import { BROWSER_KINDS } from '../router';

export { JobFailure };

export function createBrowserHandlers(deps) {
  const h = {
    attribute_volume: (ctx) => attributeVolume(ctx, deps),
    seismic_qc: (ctx) => seismicQc(ctx, deps),
    poststack_inversion: (ctx) => poststackInversion(ctx, deps),
    property_prediction: (ctx) => propertyPrediction(ctx, deps),
    sample_volumes: (ctx) => sampleVolumes(ctx, deps),
    avo_volumes: (ctx) => avoVolumes(ctx, deps),
    match_stacks: (ctx) => matchStacksJob(ctx, deps),
    spectral_balance: (ctx) => balanceStacksJob(ctx, deps),
    prestack_inversion: (ctx) => prestackInversion(ctx, deps),
    zone_maps: (ctx) => zoneMaps(ctx, deps),
  };
  for (const k of BROWSER_KINDS) if (!h[k]) throw new Error(`browser handler missing for ${k}`);
  return Object.freeze(h);
}

/**
 * Run one job the way threadEntry.js runs it on the server: a context with
 * progress and a cancel flag; the result, or a JobFailure's stage and message.
 * @returns {Promise<{ok: true, result: Object} | {ok: false, stage: string, message: string, cancelled?: boolean}>}
 */
export async function runBrowserHandler({ job, deps, isCancelled = () => false, onProgress = () => {}, log = console }) {
  const handlers = createBrowserHandlers(deps);
  const handler = handlers[job.kind];
  if (!handler) return { ok: false, stage: 'unknown_kind', message: `This computer does not run "${job.kind}" jobs.` };
  const ctx = {
    job,
    params: job.params || {},
    inputs: job.input_refs || {},
    log: { info: (m) => log.info?.(m), warn: (m) => log.warn?.(m), error: (m) => log.error?.(m) },
    get cancelled() { return isCancelled(); },
    progress(fraction, message) { onProgress(Math.max(0, Math.min(1, Number(fraction) || 0)), message); },
  };
  try {
    const result = await handler(ctx);
    if (isCancelled()) return { ok: false, stage: 'cancelled', message: 'Cancelled.', cancelled: true };
    return { ok: true, result: result ?? null };
  } catch (e) {
    if (isCancelled()) return { ok: false, stage: 'cancelled', message: 'Cancelled.', cancelled: true };
    if (e instanceof JobFailure) return { ok: false, stage: e.stage, message: e.message };
    return { ok: false, stage: 'browser_error', message: `Unexpected error on this computer: ${e?.message || e}` };
  }
}
