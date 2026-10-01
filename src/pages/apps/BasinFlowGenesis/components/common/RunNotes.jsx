// What the shown result rests on (AppUpgrade BF-U1-012, -014, -015, -011).
// A result says when the inputs changed after it was computed or when it
// belongs to another model; the model notes say what the engine skips or
// assumes (erosion with no amount, placeholder ages, older-chart ages,
// presets left by an earlier release).

import React, { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useBasinFlow } from '../../contexts/BasinFlowContext';
import { useMultiWell } from '../../contexts/MultiWellContext';
import { engineInputsKey, modelNotes, chartAgeFlags } from '../../services/honesty';

/** Whether the shown result still describes the current inputs. */
export function resultState(results, state, activeWellId) {
  if (!results?.data) return null;
  const run = results.runOf;
  if (!run) return { stale: true, text: 'This result carries no record of the inputs it was computed from (a scenario saved before this release). Run the model to compare it with the current inputs.' };
  if (run.wellId && activeWellId && run.wellId !== activeWellId) return { stale: true, text: 'This result belongs to another model. Run this model to see its own result.' };
  if (run.key !== engineInputsKey(state)) return { stale: true, text: `The inputs changed after this result was computed (${new Date(run.at).toLocaleString()}). Run the model again before reading it.` };
  return { stale: false, text: null };
}

export default function RunNotes({ showModel = true, testid = 'bf-run-notes' }) {
  const { state } = useBasinFlow();
  const { state: mw } = useMultiWell();
  const rs = useMemo(() => resultState(state.results, state, mw.activeWellId), [state, mw.activeWellId]);
  const notes = useMemo(() => (showModel ? modelNotes(state, { chartFlags: chartAgeFlags(state) }) : []), [state, showModel]);
  if (!rs?.stale && !notes.length) return null;
  return (
    <div className="space-y-1" data-testid={testid}>
      {rs?.stale && (
        <div className="flex gap-2 items-start rounded border border-pl-warning/40 bg-pl-warning-bg px-2 py-1 text-[11px] text-pl-warning-text" data-testid="bf-results-stale">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {rs.text}
        </div>
      )}
      {notes.map((n) => (
        <div key={n.key} className="flex gap-2 items-start rounded border border-pl-border bg-pl-surface px-2 py-1 text-[11px] text-pl-text" data-testid="bf-model-note" data-note={n.key}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-pl-warning-text" /> {n.text}
        </div>
      ))}
    </div>
  );
}
