// Job kinds this worker runs. Each handler is async (ctx) => resultRefs.
// The list doubles as the claim filter, so a worker never claims a kind it
// cannot run (useful when hosts run different versions during a rollout).
// Handlers that need services (Supabase, the object store, scratch disk)
// get them from createHandlers(deps); main.js builds the real ones.
import { noop } from './noop.js';
import { stackToV4 } from './stackToV4.js';
import { attributeVolume } from './attributeVolume.js';
import { ingestUrl } from './ingestUrl.js';
import { scanDataset } from './scanDataset.js';
import { seismicQc } from './seismicQc.js';
import { poststackInversion } from './poststackInversion.js';
import { propertyPrediction } from './propertyPrediction.js';
import { exportSegy } from './exportSegy.js';
import { ingestGathers } from './ingestGathers.js';
import { angleStacks } from './angleStacks.js';
import { avoVolumes } from './avoVolumes.js';
import { sampleVolumes } from './sampleVolumes.js';
import { prestackInversion } from './prestackInversion.js';
import { prestackQc } from './prestackQc.js';
import { trimGathers } from './trimGathers.js';
import { matchStacksJob } from './matchStacks.js';

export const KINDS = Object.freeze(['noop', 'stack_to_v4', 'attribute_volume', 'ingest_url', 'scan_dataset', 'seismic_qc', 'poststack_inversion', 'property_prediction', 'export_segy', 'ingest_gathers', 'angle_stacks', 'avo_volumes', 'sample_volumes', 'prestack_inversion', 'prestack_qc', 'trim_gathers', 'match_stacks']);

export function createHandlers(deps = {}) {
  return Object.freeze({
    noop,
    stack_to_v4: (ctx) => stackToV4(ctx, deps),
    attribute_volume: (ctx) => attributeVolume(ctx, deps),
    ingest_url: (ctx) => ingestUrl(ctx, deps),
    scan_dataset: (ctx) => scanDataset(ctx, deps),
    seismic_qc: (ctx) => seismicQc(ctx, deps),
    poststack_inversion: (ctx) => poststackInversion(ctx, deps),
    property_prediction: (ctx) => propertyPrediction(ctx, deps),
    export_segy: (ctx) => exportSegy(ctx, deps),
    ingest_gathers: (ctx) => ingestGathers(ctx, deps),
    angle_stacks: (ctx) => angleStacks(ctx, deps),
    avo_volumes: (ctx) => avoVolumes(ctx, deps),
    sample_volumes: (ctx) => sampleVolumes(ctx, deps),
    prestack_inversion: (ctx) => prestackInversion(ctx, deps),
    prestack_qc: (ctx) => prestackQc(ctx, deps),
    trim_gathers: (ctx) => trimGathers(ctx, deps),
    match_stacks: (ctx) => matchStacksJob(ctx, deps),
  });
}
