// The browser job worker (Local Workspace L1): runs one seismic worker job
// on this computer with the server's own handler code (jobs/browserHandlers)
// and browser dependencies (jobs/browserDeps). A postMessage shell; the page
// side is jobs/browserJobs.js.
//
// main -> worker: {type:'run', id, job, cfg:{supabaseUrl, anonKey, engineCommit}, token}
//                 {type:'cancel', id}   {type:'token', nonce, token}
// worker -> main: {type:'progress', id, fraction, message}
//                 {type:'need-token', id, nonce}
//                 {type:'done', id, outcome}   outcome = runBrowserHandler()'s
import { createClient } from '@supabase/supabase-js';
import { buildBrowserDeps, tokenFetch } from '../jobs/browserDeps';
import { runBrowserHandler } from '../jobs/browserHandlers';

const cancelled = new Set();
const waiters = new Map();
let nonce = 0;
let token = null;
let tokenAt = 0;
const TOKEN_REUSE_MS = 4 * 60 * 1000;

function getTokenFor(id) {
  return (force) => {
    if (!force && token && Date.now() - tokenAt < TOKEN_REUSE_MS) return Promise.resolve(token);
    nonce += 1;
    const n = nonce;
    return new Promise((resolve) => {
      waiters.set(n, (t) => { token = t; tokenAt = Date.now(); resolve(t); });
      self.postMessage({ type: 'need-token', id, nonce: n });
    });
  };
}

async function run({ id, job, cfg, token: t }) {
  token = t; tokenAt = Date.now();
  const getToken = getTokenFor(id);
  const client = createClient(cfg.supabaseUrl, cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: tokenFetch(() => getToken(false)) },
  });
  const deps = buildBrowserDeps({ client, supabaseUrl: cfg.supabaseUrl, getToken, engineCommit: cfg.engineCommit });
  let last = 0;
  const outcome = await runBrowserHandler({
    job,
    deps,
    isCancelled: () => cancelled.has(id),
    onProgress: (fraction, message) => {
      const now = Date.now();
      if (fraction < 1 && now - last < 500) return;
      last = now;
      self.postMessage({ type: 'progress', id, fraction, message: message ?? null });
    },
  });
  try { await deps.closeWriters(); } catch (e) {
    if (outcome.ok) { outcome.ok = false; outcome.stage = 'write_failed'; outcome.message = e.message; }
  }
  self.postMessage({ type: 'done', id, outcome });
}

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'token') { const w = waiters.get(msg.nonce); if (w) { waiters.delete(msg.nonce); w(msg.token); } return; }
  if (msg.type === 'cancel') { cancelled.add(msg.id); return; }
  if (msg.type === 'run') {
    run(msg).catch((err) => self.postMessage({ type: 'done', id: msg.id, outcome: { ok: false, stage: 'browser_error', message: err?.message || String(err) } }));
  }
};
