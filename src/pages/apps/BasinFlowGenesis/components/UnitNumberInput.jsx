// A number box over an SI value shown in the display unit (metres or feet,
// C or F). It keeps the text as typed while it is the source of the stored
// value, so "13.7" ft is not stored as 137 ft and "2." keeps its point (the
// shared useDraftInput hook). A box that does not hold a number yet (cleared,
// or "-") stores nothing: the last value is kept and the box says so by
// name, then shows the kept value again on blur. Before this, a cleared box
// stored NaN into the model.

import React from 'react';
import { Input } from '@/components/ui/input';
import { useDraftInput, parseTypedNumber } from '@/hooks/useUnitDraft';
import { tidy } from '../services/units';

const id = (v) => v;

export default function UnitNumberInput({
  value, onCommit, name, unit = '', toDisplay = id, fromDisplay = id, digits = 2,
  className, 'data-testid': testId, ...rest
}) {
  const d = useDraftInput(value, onCommit, {
    unit,
    toDisplay: (v) => tidy(toDisplay(v), digits),
    toStored: (text) => {
      const n = parseTypedNumber(text);
      if (n === undefined) return undefined;
      const si = fromDisplay(n);
      return Number.isFinite(si) ? si : undefined;
    },
  });
  return (
    <>
      <Input
        {...rest}
        type="text"
        inputMode="decimal"
        data-testid={testId}
        aria-label={rest['aria-label'] ?? name}
        aria-invalid={d.refused || undefined}
        value={d.value}
        onChange={(e) => d.onChange(e.target.value)}
        onBlur={d.onBlur}
        className={className}
      />
      {d.refused && (
        <span role="alert" data-testid={testId ? `${testId}-refused` : undefined} className="block text-[10px] text-pl-danger-text mt-0.5">
          {name} needs a number. The last value is kept.
        </span>
      )}
    </>
  );
}
