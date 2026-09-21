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
  UNACCEPTABLE: 'border-red-500/60 bg-red-950/40 text-red-100',
  TOLERABLE: 'border-amber-500/60 bg-amber-950/30 text-amber-100',
  BROADLY_ACCEPTABLE: 'border-emerald-500/50 bg-emerald-950/40 text-emerald-200',
  EXCEEDS: 'border-red-500/60 bg-red-950/40 text-red-100',
  TOUCHES: 'border-amber-500/60 bg-amber-950/30 text-amber-100',
  AT_LINE: 'border-amber-500/60 bg-amber-950/30 text-amber-100',
  BELOW: 'border-emerald-500/50 bg-emerald-950/40 text-emerald-200',
  GROSSLY_DISPROPORTIONATE: 'border-sky-500/50 bg-sky-950/40 text-sky-200',
  NOT_GROSSLY_DISPROPORTIONATE: 'border-amber-500/60 bg-amber-950/30 text-amber-100',
};

/** An engine state word (band, F-N state, verdict), shown exactly as the engine names it. */
export const StateBadge = ({ state, testId }) => (
  <span
    data-testid={testId}
    className={`inline-block rounded border px-2 py-0.5 font-mono text-xs ${TONE[state] || 'border-slate-600 text-slate-300'}`}
  >
    {state}
  </span>
);

/** A refusal with where in the study it came from. */
export const Refusal = ({ result }) => (result?.error
  ? <EngineError result={result} prefix={result.where} />
  : null);

export const RemoveButton = ({ onClick, label }) => (
  <Button
    type="button" variant="ghost" size="sm" onClick={onClick} aria-label={label} title={label}
    className="h-8 px-2 text-slate-500 hover:text-red-300"
  >
    <Trash2 className="h-4 w-4" />
  </Button>
);
