// The services every handler gets (createHandlers(deps)), built from the
// configuration. main.js builds them for in-process jobs and jobThread.js
// builds the same set inside each job's worker thread, so a handler sees the
// same deps whichever way it runs. Without Supabase settings (the in-image
// selfcheck) only the settings-free entries are present.
import { createClient } from '@supabase/supabase-js';
import { makeSigner } from './s3.js';
import { retryingStorage } from './retryingStorage.js';
import { supabaseStorageClient } from '../../../src/pages/apps/Seismolord/services/seismicStorageClient.js';
import { resolveCodec, DEFLATE_RAW } from '../../../packages/engines/engines/seismolord/brickCodecV4.js';

export function buildDeps(cfg, log) {
  const base = {
    sign: makeSigner(cfg.s3),
    scratchDir: cfg.scratchDir,
    // CompressionStream deflate-raw, the same codec the browser import uses
    codec: resolveCodec({ compression: DEFLATE_RAW }),
    memoryBudgetBytes: cfg.convertBudgetBytes,
    supabaseUrl: cfg.supabaseUrl,
    serviceRoleKey: cfg.serviceRoleKey,
    rawBucket: cfg.s3.rawBucket,
    workBucket: cfg.s3.workBucket,
    engineCommit: cfg.engineCommit,
  };
  if (!cfg.supabaseUrl || !cfg.serviceRoleKey) return base;
  const admin = createClient(cfg.supabaseUrl, cfg.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // attribute_volume reads parent bricks the way the browser worker does,
  // with the service key as its bearer token (supabaseUrl, serviceRoleKey)
  return { ...base, admin, storage: retryingStorage(supabaseStorageClient(admin, 'seismic'), { log }) };
}
