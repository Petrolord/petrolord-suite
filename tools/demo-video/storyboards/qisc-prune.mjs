// Off camera, extended cut: the QI showcase project keeps a record of every
// run, also of runs whose volumes the setup deleted, and QI Studio lists them
// by name beside the new ones (deferred: hide runs whose volumes are gone).
// This drops those records from the saved project before QI Studio opens.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function volumeIdsOf(run) {
  const ids = [];
  if (UUID.test(String(run?.volumeId || ''))) ids.push(run.volumeId);
  for (const v of Object.values(run?.volumeIds || {})) if (UUID.test(String(v))) ids.push(v);
  return ids;
}

/** Remove every `runs` entry that names a volume no longer in the account. */
export function pruneRuns(node, exists) {
  if (Array.isArray(node)) return node.map((x) => pruneRuns(x, exists));
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'runs' && Array.isArray(v)) {
      out[k] = v.filter((r) => { const ids = volumeIdsOf(r); return !ids.length || ids.every((id) => exists.has(id)); }).map((r) => pruneRuns(r, exists));
    } else out[k] = pruneRuns(v, exists);
  }
  return out;
}

export async function pruneQiProject(env, projectName) {
  const src = fs.readFileSync(path.resolve(HERE, '../../../src/lib/customSupabaseClient.js'), 'utf8');
  const url = src.match(/supabaseUrl = '([^']*)'/)[1];
  const key = src.match(/supabaseAnonKey = '([^']*)'/)[1];
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error: e1 } = await sb.auth.signInWithPassword({ email: env.DEMO_EMAIL, password: env.DEMO_PASSWORD });
  if (e1) throw e1;
  const { data: vols } = await sb.from('seismic_volumes').select('id');
  const exists = new Set((vols || []).map((v) => v.id));
  const { data: row, error } = await sb.from('saved_qi_studio_projects').select('id,version,inputs_data').eq('project_name', projectName).single();
  if (error) throw error;
  const pruned = pruneRuns(row.inputs_data, exists);
  if (JSON.stringify(pruned) === JSON.stringify(row.inputs_data)) return 0;
  const { error: e2 } = await sb.from('saved_qi_studio_projects').update({ inputs_data: pruned, version: row.version }).eq('id', row.id);
  if (e2) throw e2;
  return 1;
}
