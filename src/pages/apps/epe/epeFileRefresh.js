// Refresh one received production file from its source (EPE video
// programme, 2026-10-13). A file received from Forecast Scenario Hub,
// Decline Curve Analysis, Waterflood Design Studio, Reservoir Simulation
// Studio or Well Spacing Optimizer is re-read by id on its card, and when the
// source changed the compare function returns the current contract as
// `now`. Re-importing through the slot's dialog either replaced every
// production file of the scenario (the field's base file beside the received
// profile) or, unticked, summed the old profile with the new one. This builds
// the new rows for THIS file only, with the same intake function the import
// used, so the card can swap the one row and leave the others alone.
import { dcaProvenanceOf, epeRowsFromContract, dcaFileName } from './epeDcaIntake';
import { hubProvenanceOf, epeRowsFromHubContract, hubFileName } from './epeHubIntake';
import { wfProvenanceOf, epeRowsFromWfContract, wfFileName } from './epeWfIntake';
import { simProvenanceOf, epeRowsFromSimContract, simFileName } from './epeSimIntake';
import { wsProvenanceOf, epeRowsFromWsContract, wsFileName } from './epeWsIntake';

/** The source kind of a received file, with its provenance record, or null. */
export function receivedSourceOf(file) {
  const kinds = [
    ['hub', hubProvenanceOf], ['dca', dcaProvenanceOf], ['wf', wfProvenanceOf],
    ['sim', simProvenanceOf], ['ws', wsProvenanceOf],
  ];
  for (const [kind, of] of kinds) {
    const p = of(file);
    if (p) return { kind, provenance: p };
  }
  return null;
}

/** The button label for a source kind. */
export const REFRESH_LABEL = Object.freeze({
  hub: 'Take the new profile',
  wf: 'Take the new forecast',
  sim: 'Take the new run',
  dca: 'Take the new forecast',
  ws: 'Take the new case',
});

/** The line under a changed source, naming the button. */
export const refreshHint = (kind) => `Press "${REFRESH_LABEL[kind]}" to replace this file only; the other files in the slot stay as they are.`;

/**
 * The rows and file name that replace `file`, from the source state its card
 * read. Only a 'changed' state with a current contract refreshes.
 *
 * @returns {{ rows: object[], fileName: string } | { error: string }}
 */
export function refreshRowsFor(file, sourceState, { receivedAt = new Date().toISOString(), build = null } = {}) {
  const src = receivedSourceOf(file);
  if (!src) return { error: 'This file was not received from another application.' };
  if (!sourceState || sourceState.state !== 'changed' || !sourceState.now) {
    return { error: 'The source has not changed since this file was received.' };
  }
  const now = sourceState.now;
  const opts = { receivedAt, build };
  try {
    switch (src.kind) {
    case 'hub': {
      const firstYear = Number(src.provenance.firstYear);
      return { rows: epeRowsFromHubContract(now, firstYear, opts), fileName: hubFileName(now) };
    }
    case 'dca': return { rows: epeRowsFromContract(now, opts), fileName: dcaFileName(now) };
    case 'wf': return { rows: epeRowsFromWfContract(now, opts), fileName: wfFileName(now) };
    case 'sim': return { rows: epeRowsFromSimContract(now, opts), fileName: simFileName(now) };
    case 'ws': return { rows: epeRowsFromWsContract(now, opts), fileName: wsFileName(now) };
    default: return { error: 'Unknown source.' };
    }
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Swap the file in the database: insert the new row (same case, owner and
 * scenario tag), then delete the old one. Returns { id } or throws.
 */
export async function replaceReceivedFile(supabase, file, made, userId) {
  const { data: newRow, error: insErr } = await supabase
    .from('epe_production_volumes')
    .insert({
      case_id: file.case_id,
      user_id: userId || file.user_id,
      file_name: made.fileName,
      data: made.rows,
      scenario_label: file.scenario_label ?? null,
    })
    .select('id')
    .single();
  if (insErr) throw new Error(insErr.message);
  const { error: delErr } = await supabase.from('epe_production_volumes').delete().eq('id', file.id);
  if (delErr) throw new Error(`The new file was saved, but the old one could not be removed (${delErr.message}). Delete it, or the engine sums both.`);
  return { id: newRow.id };
}
