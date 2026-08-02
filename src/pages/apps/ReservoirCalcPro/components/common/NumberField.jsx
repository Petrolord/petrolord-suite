import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';

// Trim float noise without truncating deliberate user entry.
const displayValue = (v) => {
    if (v === null || v === undefined || v === '') return '';
    const n = Number(v);
    if (!isFinite(n)) return '';
    return String(parseFloat(n.toPrecision(10)));
};

/**
 * Controlled numeric input that never fights the user's typing. The classic
 * bug it fixes: binding `value` straight to state with `parseFloat(x) || 0`
 * snaps a cleared field back to "0", so fresh numbers get typed after a stuck
 * leading zero. Here the visible text is local while the field is focused;
 * the parsed number is committed on every keystroke (empty/partial entry
 * commits `emptyValue`, default null) and the text resyncs from state on blur
 * or when the value changes externally (project load, preset, unit toggle).
 */
const NumberField = ({ value, onCommit, emptyValue = null, className, ...rest }) => {
    const [text, setText] = useState(() => displayValue(value));
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        if (!focused) setText(displayValue(value));
    }, [value, focused]);

    const handleChange = (raw) => {
        setText(raw);
        const parsed = parseFloat(raw);
        onCommit(isFinite(parsed) ? parsed : emptyValue);
    };

    return (
        <Input
            type="number"
            value={text}
            onChange={e => handleChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={className}
            {...rest}
        />
    );
};

export default NumberField;
