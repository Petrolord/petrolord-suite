// Undo commands for the horizon WRITES that used to be permanent
// (group 5): the edit session's Save, Track 3D and Grow target. Pure
// builders around injected I/O so the command logic is testable without
// Supabase; ViewerPanel supplies the closures and pushes the result on
// the global UndoStack.

/**
 * A write that CREATED a horizon row (Track 3D, Save of a new horizon).
 * Undo deletes the row; redo creates it again. A re-created row has a
 * new id, so the command tracks the live row in a box.
 *
 * @param {Object} p
 * @param {string} p.label
 * @param {Object} p.row the created row
 * @param {(row: Object) => Promise<void>} p.remove delete a row (+ blobs)
 * @param {() => Promise<Object>} p.create re-create it, returning the row
 * @returns {{label: string, undo: Function, redo: Function, box: {row: Object}}}
 */
export function createdHorizonCommand({
  label, row, remove, create,
}) {
  const box = { row };
  return {
    label,
    box,
    undo: async () => { await remove(box.row); },
    redo: async () => { box.row = await create(); },
  };
}

/**
 * A write that OVERWROTE a horizon row in place (Save of an edited
 * horizon, Grow target). Undo writes the previous picks back into the
 * same row, so its id, version chain and links survive; redo writes the
 * new picks again.
 *
 * @param {Object} p
 * @param {string} p.label
 * @param {Float32Array} p.before picks before the write
 * @param {Float32Array} p.after picks the write stored
 * @param {Object} [p.prevParams] params to restore on undo
 * @param {?Float32Array} [p.prevConfidence] confidence layer before
 * @param {?Float32Array} [p.nextConfidence] confidence layer written
 * @param {(picks: Float32Array, params: ?Object, confidence: ?Float32Array) => Promise<void>} p.write
 */
export function rewriteHorizonCommand({
  label, before, after, prevParams = null, prevConfidence = null, nextConfidence = null, write,
}) {
  return {
    label,
    undo: () => write(before, prevParams || {}, prevConfidence),
    redo: () => write(after, null, nextConfidence),
  };
}
