// Per-volume display state saved with the interpretation project
// (tester feedback 2026-09-22: "save the visibility state with the
// project"). Stored as a reserved row in the existing seismic_sessions
// table (kind 'session', name `${DISPLAY_PREFIX}${volumeId}`), so it
// needs no schema change, rides the user-scoped RLS the named sessions
// already have, and follows the user across browsers. The Sessions
// dialog never lists these rows (isReservedSessionName).
//
// Payload: { v: 1, sliceVis: {inline, xline, time} }. Every failure
// (signed out, offline, harness) is swallowed: the browser's
// localStorage copy keeps working, the server copy is a convenience.

import { supabase } from '@/lib/customSupabaseClient';
import {
  saveSession, RESERVED_SESSION_PREFIX, isReservedSessionName,
} from './sessionsService';
import { sanitizeSliceVis } from '../viewer/planeMarks';

export const DISPLAY_PREFIX = RESERVED_SESSION_PREFIX;
export { isReservedSessionName };

/**
 * @param {string} volumeId
 * @returns {Promise<?{sliceVis: Object}>} null when nothing is saved or
 *   the read failed
 */
export async function loadVolumeDisplay(volumeId) {
  if (!volumeId) return null;
  try {
    const { data, error } = await supabase
      .from('seismic_sessions')
      .select('payload')
      .eq('kind', 'session')
      .eq('name', `${DISPLAY_PREFIX}${volumeId}`)
      .maybeSingle();
    if (error || !data?.payload?.sliceVis) return null;
    return { sliceVis: sanitizeSliceVis(data.payload.sliceVis) };
  } catch {
    return null;
  }
}

/** Upsert the volume's display state; resolves false on any failure. */
export async function saveVolumeDisplay(volumeId, { sliceVis }) {
  if (!volumeId) return false;
  try {
    await saveSession({
      name: `${DISPLAY_PREFIX}${volumeId}`,
      kind: 'session',
      payload: { v: 1, sliceVis: sanitizeSliceVis(sliceVis) },
    });
    return true;
  } catch {
    return false;
  }
}
