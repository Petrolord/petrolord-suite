// The services the seismic worker's handlers get, built for a browser Web
// Worker (docs/scope/LocalWorkspace-DESIGN.md sections 4.1 and 4.2). The
// handler code and the engines are the server's own files, imported as they
// are; only these dependencies differ:
//
//   server worker                         this browser
//   admin   service-role client           the user's own client (RLS decides)
//   storage upload to the seismic bucket  this computer's workspace for local
//                                         volumes; the bucket for small results
//   makeFetcher  service-key reads        local bricks first, else the bucket
//                                         with the user's token
//   quota   the cloud pool                checked against this computer's disk
//                                         before the job starts (see browserJobs)
//
// So a job run here and the same job run on the server produce the same
// bricks: the parity tests and the live Ekene diff check exactly that.

import { storageBrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCache.js';
import { v4BrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCodecV4.js';
import { supabaseStorageClient } from '../../../pages/apps/Seismolord/services/seismicStorageClient.js';
import { withLocalBricks, splitBrickPath, defaultLocalBrickSource } from '../localBricks';
import { defaultRegistry } from '../registry';
import { openLocalVolume } from '../workspace';

const QUOTA_RPCS = new Set(['seismic_storage_usage_bytes_for', 'seismic_storage_quota_bytes_for', 'seismic_storage_quota_bytes', 'seismic_storage_usage_bytes']);
const NO_LIMIT = Number.MAX_SAFE_INTEGER;

/**
 * A fetch that always sends the current user token (supabase-js 2.30 has no
 * accessToken hook, and a job can outlive one token).
 */
export function tokenFetch(getToken, baseFetch = (...a) => fetch(...a)) {
  return async (input, init = {}) => {
    const token = await getToken();
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('Authorization', `Bearer ${token}`);
    return baseFetch(input, { ...init, headers });
  };
}

/**
 * @param {Object} p
 * @param {Object} p.client supabase-js client signed in as the user (tokenFetch)
 * @param {string} p.supabaseUrl
 * @param {(force?: boolean) => Promise<string>} p.getToken
 * @param {Object} [p.registry]
 * @param {Object} [p.source] local brick source
 * @param {Function} [p.openStore] (volumeId) => pack store (write)
 * @param {string} [p.engineCommit]
 */
export function buildBrowserDeps({
  client, supabaseUrl, getToken, registry = defaultRegistry(), source = defaultLocalBrickSource(),
  openStore = (volumeId) => openLocalVolume(volumeId, { write: true, registry }), engineCommit = null,
}) {
  const cloudStorage = supabaseStorageClient(client, 'seismic');
  const cloudFetch = storageBrickFetcher({ supabaseUrl, getToken, bucket: 'seismic' });
  const rawFetch = withLocalBricks(cloudFetch, source);
  const writers = new Map(); // volumeId -> Promise<store>
  const written = new Map(); // volumeId -> Set(keys)

  const isLocalTarget = async (volumeId) => {
    const rec = await registry.getVolume(volumeId).catch(() => null);
    return Boolean(rec && rec.state === 'writing');
  };
  const writerFor = (volumeId) => {
    if (!writers.has(volumeId)) writers.set(volumeId, openStore(volumeId));
    return writers.get(volumeId);
  };

  const storage = {
    async upload(path, bytes, opts = {}) {
      const parts = splitBrickPath(path);
      if (parts && await isLocalTarget(parts.volumeId)) {
        const store = await writerFor(parts.volumeId);
        if (parts.key === 'manifest.json') {
          const manifest = JSON.parse(new TextDecoder().decode(bytes));
          await store.putJson('manifest', manifest);
          // the manifest is metadata: it also goes to the cloud, so colleagues
          // see the geometry and statistics of a volume they cannot open
          await cloudStorage.upload(path, bytes, { ...opts, contentType: 'application/json', upsert: true });
          return 'uploaded';
        }
        await store.put(parts.key, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
        if (!written.has(parts.volumeId)) written.set(parts.volumeId, new Set());
        written.get(parts.volumeId).add(parts.key);
        return 'uploaded';
      }
      // small results (zone map grids) and anything not local: the bucket
      return cloudStorage.upload(path, bytes, opts);
    },
    list: (dir) => cloudStorage.list(dir),
  };

  // the handlers' admin client: the user's client, with storage and the
  // quota functions routed as above
  const admin = {
    from: (t) => client.from(t),
    async rpc(fn, args) {
      if (QUOTA_RPCS.has(fn)) {
        // local products are checked against this computer's disk before the
        // job starts; any cloud write still meets the bucket's own policy
        return { data: /usage/.test(fn) ? 0 : NO_LIMIT, error: null };
      }
      return client.rpc(fn, args);
    },
    storage: {
      from(bucket) {
        const cloud = client.storage.from(bucket);
        if (bucket !== 'seismic') return cloud;
        return {
          async download(path) {
            const local = await source.read(path).catch((e) => { throw e; });
            if (local) return { data: new Blob([local]), error: null };
            return cloud.download(path);
          },
          async remove(paths) {
            const rest = [];
            for (const p of paths) {
              const parts = splitBrickPath(p);
               
              if (parts && await isLocalTarget(parts.volumeId)) continue; // the local store is removed whole on failure
              rest.push(p);
            }
            if (!rest.length) return { data: [], error: null };
            return cloud.remove(rest);
          },
          upload: (...a) => cloud.upload(...a),
          list: (...a) => cloud.list(...a),
        };
      },
    },
  };

  const readManifest = async (path) => {
    const buf = await rawFetch(path);
    return JSON.parse(new TextDecoder().decode(buf));
  };

  return {
    admin,
    storage,
    supabaseUrl,
    serviceRoleKey: undefined,
    engineCommit,
    makeFetcher: (manifest) => v4BrickFetcher(rawFetch, manifest),
    readManifest,
    readBlob: (path) => rawFetch(path),
    /** close every local writer (flush the open packs) */
    async closeWriters() {
      for (const p of writers.values()) {
         
        const s = await p.catch(() => null);
         
        if (s) await s.close();
      }
    },
    writtenVolumes: () => [...writers.keys()],
  };
}
