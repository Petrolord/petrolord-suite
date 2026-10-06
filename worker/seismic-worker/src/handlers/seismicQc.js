// seismic_qc: data QC of a stored volume on the server (QI programme Q4a /
// A5, 2026-10-06): spectra and bandwidth per time window, signal-to-noise
// per sampled inline and the acquisition footprint on RMS maps, by the same
// runner the browser uses (src/pages/apps/QIStudio/services/qcRun.js). Read
// only: nothing is written but the job's result.
//
// params: { volume_id, inlines?, windows?, slices? }
// The worker uses the service role, so this handler checks what RLS would:
// the volume belongs to the job's user and is ready.
import { JobFailure } from '../runJob.js';
import { runSeismicQc, qcIssues } from '../../../../src/pages/apps/QIStudio/services/qcRun.js';
import { assertFloat32Parent } from '../../../../src/pages/apps/Seismolord/services/attributeSurveyMeta.js';
import { storageBrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCache.js';
import { v4BrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCodecV4.js';
import { geomFromManifest, brickKey } from '../../../../packages/engines/engines/seismolord/sliceAssembly.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const intIn = (v, lo, hi, dflt) => (v == null ? dflt : (Number.isInteger(v) && v >= lo && v <= hi ? v : NaN));

export function validateQcParams(p) {
  if (!p || typeof p !== 'object') return 'Missing job settings.';
  if (!UUID.test(String(p.volume_id))) return 'volume_id is required.';
  if (Number.isNaN(intIn(p.inlines, 2, 200, 12))) return 'inlines must be a whole number from 2 to 200.';
  if (Number.isNaN(intIn(p.windows, 1, 8, 3))) return 'windows must be a whole number from 1 to 8.';
  if (Number.isNaN(intIn(p.slices, 1, 12, 3))) return 'slices must be a whole number from 1 to 12.';
  return null;
}

export async function seismicQc(ctx, deps) {
  const p = ctx.params;
  const problem = validateQcParams(p);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin } = deps;
  const { data: vol, error } = await admin.from('seismic_volumes')
    .select('id,user_id,status,name,storage_path').eq('id', p.volume_id).maybeSingle();
  if (error) throw new Error(`Could not read volume ${p.volume_id}: ${error.message}`);
  if (!vol || vol.user_id !== uid) throw new JobFailure('not_found', 'The volume was not found in your account. Server QC runs on your own volumes.');
  if (vol.status !== 'ready') throw new JobFailure('validate_failed', `The volume is ${vol.status}; QC needs a fully uploaded volume.`);
  const readManifest = deps.readManifest || (async (path) => {
    const { data, error: e } = await admin.storage.from('seismic').download(path);
    if (e) throw new Error(`Could not read the volume manifest: ${e.message}`);
    return JSON.parse(await data.text());
  });
  const manifest = await readManifest(`${vol.storage_path}/manifest.json`);
  try { assertFloat32Parent(manifest); } catch (e) { throw new JobFailure('validate_failed', e.message); }
  const fetcher = deps.makeFetcher
    ? deps.makeFetcher(manifest)
    : v4BrickFetcher(storageBrickFetcher({ supabaseUrl: deps.supabaseUrl, getToken: async () => deps.serviceRoleKey, bucket: 'seismic' }), manifest);
  const geom = geomFromManifest(manifest);
  const getBrick = async (i, j, k) => new Float32Array(await fetcher(brickKey(vol.storage_path, i, j, k)));
  const dtMs = Number(manifest.geometry.dt_us) / 1000;
  let qc;
  try {
    qc = await runSeismicQc({
      getBrick, geom, dtMs,
      inlines: p.inlines ?? 12, windows: p.windows ?? 3, slices: p.slices ?? 3,
      onProgress: (f, msg) => ctx.progress(Math.min(0.99, f), msg),
      shouldCancel: () => ctx.cancelled,
    });
  } catch (e) {
    throw new JobFailure('compute_failed', e.message);
  }
  if (!qc) return null; // cancelled
  return { volume_id: vol.id, volume_name: vol.name, qc, issues: qcIssues(qc, vol.name) };
}
