// A numeric input that shows a stored (oilfield) value in the display unit
// and stores what is typed back in oilfield units (FLUID-U1, PL3 and PL11).
// While a field has focus it shows exactly what was typed, so "2.", "-" and
// a cleared field are never rewritten under the cursor.
import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFluidUnits } from '@/components/fluidstudio/FluidUnitsContext';

export const UnitInput = ({ id, kind = 'dimensionless', value, onChange, className, placeholder, step = 'any', min, title }) => {
  const u = useFluidUnits();
  const [draft, setDraft] = useState(null);
  const shown = draft ?? u.text(kind, value);
  return (
    <Input
      id={id}
      type="number"
      step={step}
      min={min}
      title={title}
      value={shown}
      placeholder={placeholder}
      className={className}
      onChange={(e) => { setDraft(e.target.value); onChange(u.value(kind, e.target.value)); }}
      onBlur={() => setDraft(null)}
    />
  );
};

/** Label, input and the unit beside it. `unit` overrides the kind's label (a unit that never converts). */
const UnitField = ({ label, id, kind, value, onChange, unit, hint, placeholder, step, labelClassName = 'text-sm font-medium text-pl-text', inputClassName, unitClassName = 'ml-2 text-sm text-pl-muted' }) => {
  const u = useFluidUnits();
  const shownUnit = unit ?? (kind ? u.label(kind) : '');
  return (
    <div>
      <Label htmlFor={id} className={labelClassName}>{label}</Label>
      <div className="flex items-center mt-1">
        <UnitInput id={id} kind={kind} value={value} onChange={onChange} placeholder={placeholder} step={step} className={inputClassName} />
        {shownUnit && <span className={`${unitClassName} whitespace-nowrap`} data-testid={`unit-${id}`}>{shownUnit}</span>}
      </div>
      {hint && <p className="text-xs text-pl-muted mt-1">{hint}</p>}
    </div>
  );
};

export default UnitField;
