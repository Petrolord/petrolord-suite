// Promote a local volume to the cloud (docs/scope/LocalWorkspace-DESIGN.md
// section 5.5): the owner chooses to upload it, through the existing
// two-stage resumable upload (display copy first, then float32), read from
// the workspace pack store instead of the upload spool. The row becomes
// 'both': it opens from the cloud on any computer, counts against the cloud
// quota from then on, and stays on this computer too.

import { createTwoStageUpload } from '../../pages/apps/Seismolord/services/uploadV4';
import { supabaseStorageClient } from '../../pages/apps/Seismolord/services/seismicStorageClient';
import { openLocalVolume } from './workspace';
import { setVolumeLocation } from './cloud';
import { defaultRegistry } from './registry';

/**
 * @param {Object} p
 * @param {Object} p.supabase
 * @param {Object} p.row the seismic_volumes row (id, storage_path, survey_meta)
 * @param {(bytes: number) => Promise<void>} p.assertQuota cloud quota check
 * @param {(state: Object) => void} [p.onProgress]
 * @param {Object} [p.registry]
 * @param {Object} [p.uploadOptions] passed to createTwoStageUpload (tests)
 * @param {Object} [p.storage] upload client (tests)
 * @returns {{run: () => Promise<Object>, pause: Function, resume: Function, cancel: Function}}
 */
export function promoteToCloud({ supabase, row, assertQuota, onProgress = () => {}, registry = defaultRegistry(), uploadOptions = {}, storage = null }) {
  let upload = null;
  return {
    async run() {
      const store = await openLocalVolume(row.id, { registry, write: true }); // the upload records its progress in the store
      const manifest = await store.getJson('manifest');
      if (!manifest) throw new Error('The local copy has no manifest, so it cannot be uploaded. Import it again.');
      const bytes = await store.bytes();
      await assertQuota(bytes);
      const { local, ...cloudManifest } = manifest;
      const client = storage || supabaseStorageClient(supabase, 'seismic');
      if (manifest.manifest_version !== 4) {
        // a derived volume (attribute, inversion): plain float32 bricks, then the manifest
        const keys = (await store.keys()).sort();
        let done = 0; let next = 0; let stop = false;
        const lane = async () => {
          while (!stop && next < keys.length) {
            const k = keys[next]; next += 1;
            // eslint-disable-next-line no-await-in-loop
            await client.upload(`${row.storage_path}/${k}`, await store.get(k), { contentType: 'application/octet-stream', upsert: false });
            done += 1;
            onProgress({ status: 'running', stage: 'f32', f32: { done, total: keys.length } });
          }
        };
        upload = { pause() {}, resume() {}, cancel() { stop = true; } };
        await Promise.all(Array.from({ length: Math.min(4, keys.length || 1) }, lane));
        if (stop) throw Object.assign(new Error('Upload cancelled.'), { name: 'UploadCancelled' });
        await client.upload(`${row.storage_path}/manifest.json`, new TextEncoder().encode(JSON.stringify(cloudManifest, null, 1)), { contentType: 'application/json', upsert: true });
        await setVolumeLocation(supabase, row.id, { storageLocation: 'both' });
        onProgress({ status: 'done', stage: 'done', f32: { done, total: keys.length } });
        return { status: 'done' };
      }
      upload = createTwoStageUpload({
        storage: client,
        spool: store,
        dir: row.storage_path,
        manifest: { ...cloudManifest, local_copy: local || null },
        ...uploadOptions,
        onProgress,
        onStage: async (stage) => {
          if (stage === 'ready') await setVolumeLocation(supabase, row.id, { storageLocation: 'both' });
        },
      });
      return upload.run();
    },
    pause: () => upload?.pause(),
    resume: () => upload?.resume(),
    cancel: () => upload?.cancel(),
  };
}
