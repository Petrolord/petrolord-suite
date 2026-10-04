// A screening input that shows the stored (oilfield) value in the display
// unit of the project and stores what is typed back in oilfield units
// (EOR-U1, PL3 and PL11). The draft hook keeps the typed text while it is
// the source of the stored value, so "2.", "-" and a cleared field are
// never rewritten under the cursor (src/hooks/useUnitDraft.js).
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDraftInput } from '@/hooks/useUnitDraft';
import { useEorScreening } from '@/contexts/EorScreeningContext';

const EorField = ({ id, label, kind, value, onChange, disabled = false, hint = null }) => {
  const { u } = useEorScreening();
  const unit = kind ? u.label(kind) : '';
  const d = useDraftInput(value ?? '', onChange, {
    toDisplay: (stored) => u.text(kind, stored),
    toStored: (text) => u.toState(kind, text),
    unit,
  });
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-pl-muted">{label}{unit ? ` (${unit})` : ''}</Label>
      <Input
        id={id} data-testid={id} className="h-8 text-sm" inputMode="decimal" autoComplete="off"
        value={d.value} disabled={disabled}
        onChange={(e) => d.onChange(e.target.value)} onBlur={d.onBlur}
        aria-invalid={d.refused || undefined}
      />
      {hint && <p className="text-[10px] text-pl-muted">{hint}</p>}
    </div>
  );
};

export default EorField;
