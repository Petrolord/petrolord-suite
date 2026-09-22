// Fault stick editor for the section window (group 5 toolbox): the
// active stick tool, the selected stick, and the pick / drag handlers
// that turn section clicks into lib/faultStickEdit operations on the
// fault DRAFT (the sticks of the active fault). Every change is one
// command on the global undo stack; a node drag is one command from
// pointer down to pointer up.
//
// Tools:
//   extend      click adds a point at the nearer end of the selected stick
//   select      click selects the nearest stick
//   shorten     click a node: it and the part toward the nearer end go
//   move        drag a node (the section streams picks, see SliceView)
//   deleteNode  click deletes the nearest node
//   deleteStick click deletes the nearest stick
// Alt+click deletes the nearest node in every tool (the old shortcut).

import { useCallback, useRef, useState } from 'react';
import {
  nearestNode, nearestStick, extendStick, moveNode, deleteNode, deleteStick,
  shortenStick, trimStickAt, newStick as appendStick,
} from '../lib/faultStickEdit';

export const FAULT_TOOLS = [
  { key: 'extend', label: 'Extend', hint: 'Click to add a point at the nearer end of the selected stick.' },
  { key: 'select', label: 'Select stick', hint: 'Click a stick to select it.' },
  { key: 'shorten', label: 'Shorten', hint: 'Click a point: it and the part of the stick beyond it are removed.' },
  { key: 'move', label: 'Move node', hint: 'Drag a point to move it.' },
  { key: 'deleteNode', label: 'Delete node', hint: 'Click a point to delete it.' },
  { key: 'deleteStick', label: 'Delete stick', hint: 'Click a stick to delete it.' },
];

// an out-of-range (or unset) selection means the LAST stick, so plain
// clicking keeps the old "add to the current stick" behaviour
const effective = (sticks, sel) => (
  Number.isInteger(sel) && sel >= 0 && sel < sticks.length ? sel : sticks.length - 1
);

/**
 * @param {Object} p
 * @param {Array<Array<{il:number, xl:number, s:number}>>} p.draftSticks
 * @param {(sticks: Array) => void} p.setDraftSticks
 * @param {import('../lib/undoStack').UndoStack} p.undoStack
 * @param {'inline'|'xline'|string} p.orientation section the picks come from
 */
export default function useFaultStickEditor({
  draftSticks, setDraftSticks, undoStack, orientation,
}) {
  const [tool, setTool] = useState('extend');
  const [selectedRaw, setSelectedRaw] = useState(null);
  const sticksRef = useRef(draftSticks);
  sticksRef.current = draftSticks;
  const selRef = useRef(null);
  const dragRef = useRef(null);

  const selected = effective(draftSticks, selectedRaw);
  selRef.current = selectedRaw;

  const axis = orientation === 'inline' || orientation === 'xline' ? orientation : null;

  const setBoth = useCallback((sticks, sel) => {
    sticksRef.current = sticks;
    selRef.current = sel;
    setDraftSticks(sticks);
    setSelectedRaw(sel);
  }, [setDraftSticks]);

  /** Apply `next` (with selection `nextSel`) as one undoable command. */
  const commit = useCallback((label, next, nextSel) => {
    const prev = sticksRef.current;
    const prevSel = selRef.current;
    if (next === prev) return false;
    setBoth(next, nextSel);
    undoStack.push({
      label,
      undo: () => setBoth(prev, prevSel),
      redo: () => setBoth(next, nextSel),
    });
    return true;
  }, [setBoth, undoStack]);

  const select = useCallback((si) => setSelectedRaw(si), []);

  /** Start a new (empty) stick and select it. */
  const newStick = useCallback(() => {
    const prev = sticksRef.current;
    if (!(prev.length && prev[prev.length - 1].length)) {
      // already on an empty stick (or nothing yet): just select it
      if (prev.length) setSelectedRaw(prev.length - 1);
      return;
    }
    const next = appendStick(prev);
    commit('new fault stick', next, next.length - 1);
  }, [commit]);

  /** Trim one node off the top or bottom of the selected stick. */
  const trim = useCallback((end) => {
    const prev = sticksRef.current;
    const si = effective(prev, selRef.current);
    if (si < 0) return;
    const next = shortenStick(prev, si, end, 1);
    commit(`shorten fault stick (${end})`, next, next.length === prev.length ? si : null);
  }, [commit]);

  /** Delete the selected stick. */
  const deleteSelected = useCallback(() => {
    const prev = sticksRef.current;
    const si = effective(prev, selRef.current);
    if (si < 0) return;
    commit('delete fault stick', deleteStick(prev, si), null);
  }, [commit]);

  /**
   * A section pick while fault picking is on. Streams during a Move drag
   * (the first call of a gesture grabs the node).
   * @param {{ilIdx:number, xlIdx:number, sample:number, altKey?:boolean}} hit
   */
  const pick = useCallback((hit) => {
    const prev = sticksRef.current;
    const point = { il: hit.ilIdx, xl: hit.xlIdx, s: hit.sample };
    const sel = effective(prev, selRef.current);

    if (hit.altKey && tool !== 'move') {
      const n = nearestNode(prev, hit, { axis });
      if (n) commit('delete fault stick point', deleteNode(prev, n.si, n.pi), n.si);
      return;
    }

    switch (tool) {
      case 'select': {
        const si = nearestStick(prev, hit, { axis });
        if (si >= 0) setSelectedRaw(si);
        return;
      }
      case 'shorten': {
        // prefer the selected stick's nodes, else the nearest node anywhere
        const n = nearestNode(prev, hit, { axis, stick: sel >= 0 ? sel : null })
          || nearestNode(prev, hit, { axis });
        if (!n) return;
        const next = trimStickAt(prev, n.si, n.pi, hit.sample);
        commit('shorten fault stick', next, next.length === prev.length ? n.si : null);
        return;
      }
      case 'deleteNode': {
        const n = nearestNode(prev, hit, { axis });
        if (n) commit('delete fault stick point', deleteNode(prev, n.si, n.pi), n.si);
        return;
      }
      case 'deleteStick': {
        const si = nearestStick(prev, hit, { axis });
        if (si >= 0) commit('delete fault stick', deleteStick(prev, si), null);
        return;
      }
      case 'move': {
        const d = dragRef.current;
        if (!d) {
          const n = nearestNode(prev, hit, { axis, maxDist: 24 });
          // a press away from any node grabs nothing for this gesture
          dragRef.current = n ? { ...n, start: prev, startSel: selRef.current } : { none: true };
          if (n) setSelectedRaw(n.si);
          return;
        }
        if (d.none) return;
        const next = moveNode(d.start, d.si, d.pi, point);
        sticksRef.current = next;
        setDraftSticks(next);
        d.moved = next;
        return;
      }
      case 'extend':
      default: {
        const si = sel;
        const next = si < 0 ? [[point]] : extendStick(prev, si, point, axis);
        commit('fault stick point', next, si < 0 ? 0 : si);
      }
    }
  }, [tool, axis, commit, setDraftSticks]);

  /** Pointer up after a streamed gesture: a node move becomes ONE command. */
  const dragEnd = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.none || !d.moved) return;
    const { start, moved, si } = d;
    undoStack.push({
      label: 'move fault stick point',
      undo: () => setBoth(start, si),
      redo: () => setBoth(moved, si),
    });
  }, [setBoth, undoStack]);

  const stick = selected >= 0 ? draftSticks[selected] : null;
  return {
    tool,
    setTool,
    selected,
    select,
    pick,
    dragEnd,
    newStick,
    trim,
    deleteSelected,
    /** the selected stick's point count, for the toolbox readout */
    selectedPoints: stick ? stick.length : 0,
    /** the section must stream pointer moves (drag tools) */
    streams: tool === 'move',
  };
}
