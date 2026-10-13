// A number field that shows and takes a length in `unit` ('m' | 'ft')
// while its value lives in metres (2026-10-13). The typed text is kept as
// typed, so "1." or a cleared field never jumps; a new metre value from
// outside (another design, a reset) replaces the text.

import React, { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { fieldFromM, unitToM } from '../services/depthUnits';

// `digits` rounds what is shown for a value set from outside (the stored
// metres are unchanged until the user types).
const UnitNumberInput = ({ valueM, unit, onChangeM, onBlurM, digits = null, ...rest }) => {
  const [text, setText] = useState(() => fieldFromM(valueM, unit, digits));
  const lastM = useRef(valueM);
  const lastUnit = useRef(unit);
  useEffect(() => {
    const same = (a, b) => (a == null && b == null) || (Number.isFinite(Number(a)) && Math.abs(Number(a) - Number(b)) < 1e-9);
    if (!same(valueM, lastM.current) || unit !== lastUnit.current) {
      setText(fieldFromM(valueM, unit, digits));
      lastM.current = valueM;
      lastUnit.current = unit;
    }
  }, [valueM, unit, digits]);
  return (
    <Input
      type="number"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const m = unitToM(e.target.value, unit);
        lastM.current = m;
        if (onChangeM) onChangeM(m, e.target.value);
      }}
      onBlur={onBlurM ? (e) => onBlurM(unitToM(e.target.value, unit), e.target.value) : undefined}
      {...rest}
    />
  );
};

export default UnitNumberInput;
