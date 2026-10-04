// An input of the VRR Monitor that shows a stored (oilfield) value in the
// display unit of the project and stores what is typed back in oilfield
// units (VRR-U1, PL3 and PL11). While the field has focus it shows exactly
// what was typed, so "20684.", "-" and a cleared field are never rewritten
// under the cursor (the SCAL Studio field, ScalField.jsx, made generic).
import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';

const UnitInput = ({ kind, value, onChange, ...rest }) => {
  const { u } = useVrrMonitor();
  const [draft, setDraft] = useState(null);
  const shown = draft ?? u.text(kind, value ?? '');
  return (
    <Input
      {...rest}
      value={shown}
      inputMode="decimal"
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const stored = u.toState(kind, text);
        if (stored !== null) onChange(stored);
      }}
      onBlur={(e) => { setDraft(null); rest.onBlur?.(e); }}
    />
  );
};

export default UnitInput;
