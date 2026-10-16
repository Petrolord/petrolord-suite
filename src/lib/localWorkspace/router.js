// Job routing (docs/scope/LocalWorkspace-DESIGN.md section 4.3). Every job
// has an executor: 'browser' (Web Workers in this tab), 'local' (the
// Petrolord Local helper, phase L2, after NAPE) or 'server' (the seismic
// worker). Rules, in order:
//   1. an input that lives only on another computer stops the job here
//      (no streaming from a colleague's machine, owner decision 6);
//   2. an input that lives only on this computer forces this computer:
//      the browser for the kinds it runs, the helper for the rest once it is
//      paired, otherwise a plain explanation;
//   3. inputs in the cloud run on the server, unless the user chose "this
//      computer" for the job (the products are then written locally).
// Pure: the caller resolves each input's placement first.

import { PLACEMENT } from './placement';

/** Kinds the browser runs with the seismic worker's own handlers (post-stack, volume in, volume out). */
export const BROWSER_KINDS = Object.freeze([
  'attribute_volume', 'seismic_qc', 'poststack_inversion', 'property_prediction', 'sample_volumes',
  'avo_volumes', 'match_stacks', 'spectral_balance', 'prestack_inversion', 'zone_maps',
]);

/** Kinds that need the helper (L2) when their input is local: gathers and raw files. */
export const HELPER_ONLY_KINDS = Object.freeze([
  'ingest_gathers', 'angle_stacks', 'trim_gathers', 'prestack_qc', 'gather_panel', 'export_segy',
  'radon_demultiple', 'fx_denoise', 'stack_to_v4', 'scan_dataset', 'ingest_url', 'remove_dataset',
]);

export const EXECUTOR = Object.freeze({ BROWSER: 'browser', LOCAL: 'local', SERVER: 'server' });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every uuid string anywhere in a params blob (the database applies the same rule). */
export function uuidsIn(value, out = new Set()) {
  if (typeof value === 'string') { if (UUID.test(value)) out.add(value.toLowerCase()); return out; }
  if (Array.isArray(value)) { for (const v of value) uuidsIn(v, out); return out; }
  if (value && typeof value === 'object') { for (const v of Object.values(value)) uuidsIn(v, out); }
  return out;
}

/**
 * @param {Object} p
 * @param {string} p.kind
 * @param {Array<{id: string, name?: string, placement: {kind: string, deviceLabel?: string}}>} p.inputs
 *   the volumes the params name (inputs and registered outputs)
 * @param {'auto'|'browser'|'server'} [p.preference] the user's choice for this job
 * @param {boolean} [p.helperPaired] Petrolord Local is paired (L2)
 * @returns {{executor: string, reason: string} | {error: string}}
 */
export function chooseExecutor({ kind, inputs = [], preference = 'auto', helperPaired = false }) {
  const away = inputs.find((v) => v.placement?.kind === PLACEMENT.ELSEWHERE || (v.placement?.kind === PLACEMENT.MISSING && !v.placement?.canOpen));
  if (away) {
    const where = away.placement.kind === PLACEMENT.MISSING ? 'is missing from this computer' : `lives on ${away.placement.deviceLabel || 'another computer'}`;
    return { error: `${away.name || 'A volume this job uses'} ${where}, so the job cannot run here. Run it on the computer that holds the volume, or ask its owner for a cloud copy.` };
  }
  const local = inputs.some((v) => v.placement?.kind === PLACEMENT.HERE);
  if (local) {
    if (BROWSER_KINDS.includes(kind)) return { executor: EXECUTOR.BROWSER, reason: 'Its volumes are on this computer, so it runs here in the browser.' };
    if (helperPaired) return { executor: EXECUTOR.LOCAL, reason: 'Its data is on this computer, so Petrolord Local runs it.' };
    return { error: 'This step reads prestack data, which needs Petrolord Local on this computer (planned after NAPE). For now, run it on data in the cloud.' };
  }
  if (preference === 'browser' && BROWSER_KINDS.includes(kind)) {
    return { executor: EXECUTOR.BROWSER, reason: 'You chose this computer: it reads from the cloud and writes the results to your workspace folder.' };
  }
  return { executor: EXECUTOR.SERVER, reason: 'Its volumes are in the cloud, so Petrolord servers run it.' };
}

// ---- executors (L2 registers 'local' here) --------------------------------
const executors = new Map();
/** Install an executor implementation: {run({kind, params, inputRefs, organizationId}) -> jobId}. */
export function registerExecutor(name, impl) { executors.set(name, impl); }
export function executorFor(name) { return executors.get(name) || null; }
