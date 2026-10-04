// One typed input of the Recovery Factor Estimator (RF-U1-008, PL11): shows
// the stored oilfield value in the display unit and stores what is typed
// back in oilfield units through the shared decimal-safe draft hook
// (src/hooks/useUnitDraft.js), so "2.", "-" and a cleared box survive typing.
// The label carries the unit; a sample value and an intake value say so.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDraftInput } from '@/hooks/useUnitDraft';

const RfField = ({ id, label, kind, u, value, onChange, note, flagged = false, disabled = false }) => {
  const unit = u ? u.label(kind) : '';
  const d = useDraftInput(value ?? '', onChange, {
    toDisplay: (stored) => (u ? u.text(kind, stored) : String(stored ?? '')),
    toStored: (text) => (u ? u.toState(kind, text) : text),
    unit,
  });
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-pl-muted">{unit ? `${label} (${unit})` : label}</Label>
      <Input
        id={id}
        data-testid={id}
        value={d.value}
        inputMode="decimal"
        disabled={disabled}
        aria-invalid={flagged || d.refused || undefined}
        onChange={(e) => d.onChange(e.target.value)}
        onBlur={d.onBlur}
        className={`h-9 ${flagged ? 'border-pl-warning' : ''}`}
      />
      {note && <p className="text-[10px] text-pl-muted leading-tight">{note}</p>}
    </div>
  );
};

export default RfField;
