// Global interpretation undo/redo (W1.2). A bounded stack of async
// commands: {label, undo(), redo()}. Commands may hit the network
// (delete/restore rows and blobs), so execution is serialized — a
// command that throws stays on its stack for retry, and the error
// surfaces to the caller (ViewerPanel toasts it).
//
// The horizon EDITOR keeps its own in-session cell-level undo (working
// grid, 40 ops); the keyboard router prefers it while an edit session
// has pending ops. This stack covers everything else: fault stick
// drafts, saves, deletes-with-restore, traverse edits.

export class UndoStack {
  /**
   * @param {number} limit oldest commands drop beyond this
   * @param {() => void} [onChange] fired after any stack mutation
   */
  constructor(limit = 60, onChange = null) {
    this.limit = limit;
    this.onChange = onChange;
    this.done = [];
    this.undone = [];
    this.busy = false;
  }

  #changed() {
    if (this.onChange) this.onChange();
  }

  /** Record an already-applied command. Clears the redo lane. */
  push(cmd) {
    if (!cmd || typeof cmd.undo !== 'function' || typeof cmd.redo !== 'function') {
      throw new Error('An undo command needs undo() and redo() functions.');
    }
    this.done.push(cmd);
    if (this.done.length > this.limit) this.done.shift();
    this.undone = [];
    this.#changed();
  }

  get canUndo() { return this.done.length > 0 && !this.busy; }

  get canRedo() { return this.undone.length > 0 && !this.busy; }

  /** Label of the next command each direction (button titles). */
  peekUndo() { return this.done.length ? this.done[this.done.length - 1].label : null; }

  peekRedo() { return this.undone.length ? this.undone[this.undone.length - 1].label : null; }

  async undo() {
    if (!this.canUndo) return null;
    const cmd = this.done[this.done.length - 1];
    this.busy = true;
    this.#changed();
    try {
      await cmd.undo();
      this.done.pop();
      this.undone.push(cmd);
      return cmd;
    } finally {
      this.busy = false;
      this.#changed();
    }
  }

  async redo() {
    if (!this.canRedo) return null;
    const cmd = this.undone[this.undone.length - 1];
    this.busy = true;
    this.#changed();
    try {
      await cmd.redo();
      this.undone.pop();
      this.done.push(cmd);
      return cmd;
    } finally {
      this.busy = false;
      this.#changed();
    }
  }

  /** Volume switch: commands reference the old volume's rows. */
  clear() {
    this.done = [];
    this.undone = [];
    this.#changed();
  }
}
