// A SCAL Studio input that shows a stored (field unit) value in the display
// unit of the project and stores what is typed back in field units
// (SCAL-U1, PL3 and PL11). While a field has focus it shows exactly what was
// typed, so "2.", "-" and a cleared field are never rewritten under the
// cursor. Without a `kind` it is the plain text field it replaced.
import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useScalStudio } from '@/contexts/ScalStudioContext';

const ScalField = ({ label, kind = null, value, onChange, placeholder, testId, disabled = false }) => {
  const { u } = useScalStudio();
  const [draft, setDraft] = useState(null);
  const unit = kind ? u.label(kind) : '';
  const shown = draft ?? (kind ? u.text(kind, value) : (value ?? ''));
  return (
    <div className="space-y-1">
      <Label className="text-xs text-pl-muted">{label}{unit ? ` (${unit})` : ''}</Label>
      <Input
        value={shown}
        placeholder={placeholder}
        className="h-9"
        inputMode="decimal"
        aria-label={label}
        data-testid={testId}
        disabled={disabled}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          if (!kind) { onChange(text); return; }
          const stored = u.toState(kind, text);
          if (stored !== null) onChange(stored);
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  );
};

export default ScalField;
