// Small pieces the QRA Studio panels share (PS3). The number field, refusal
// box, basis list, stat, note, select, panel, grid and result block are PS1's
// and PS2's, reused as they are.
import React from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  BasisList, EngineError, Grid, Note, NumField, Panel, Result, SelectField, Stat, TextField, Warnings, refused,
} from '@/components/processsafety/consequence/fields';

export {
  BasisList, EngineError, Grid, Note, NumField, Panel, Result, SelectField, Stat, TextField, Warnings, refused,
};

const TONE = {
  UNACCEPTABLE: 'border-pl-danger/40 bg-pl-danger-bg text-pl-danger-text',
  TOLERABLE: 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text',
  BROADLY_ACCEPTABLE: 'border-pl-success/40 bg-pl-success-bg text-pl-success-text',
  EXCEEDS: 'border-pl-danger/40 bg-pl-danger-bg text-pl-danger-text',
  TOUCHES: 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text',
  AT_LINE: 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text',
  BELOW: 'border-pl-success/40 bg-pl-success-bg text-pl-success-text',
  GROSSLY_DISPROPORTIONATE: 'border-pl-info/40 bg-pl-info-bg text-pl-info-text',
  NOT_GROSSLY_DISPROPORTIONATE: 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text',
};

/** An engine state word (band, F-N state, verdict), shown exactly as the engine names it. */
export const StateBadge = ({ state, testId }) => (
  <span
    data-testid={testId}
    className={`inline-block rounded border px-2 py-0.5 font-mono text-xs ${TONE[state] || 'border-pl-border-strong text-pl-text'}`}
  >
    {/* Engine states are enum keys; show them as words (QRA-T1-002). */}
    {state == null ? state : String(state).replace(/_/g, ' ')}
  </span>
);

/** A refusal with where in the study it came from. */
export const Refusal = ({ result }) => (result?.error
  ? <EngineError result={result} prefix={result.where} />
  : null);

export const RemoveButton = ({ onClick, label }) => (
  <Button
    type="button" variant="ghost" size="sm" onClick={onClick} aria-label={label} title={label}
    className="h-8 px-2 text-pl-muted hover:text-pl-danger-text"
  >
    <Trash2 className="h-4 w-4" />
  </Button>
);
