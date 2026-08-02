import React, { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { INPUT_UNIT_OPTIONS, toCanonical, fromCanonical } from '../../services/unitsCatalog';

// Trim float noise from round-trip conversions without truncating user entry.
const displayRound = (v) => {
    if (v === null || v === undefined || !isFinite(v)) return '';
    return String(parseFloat(Number(v).toPrecision(8)));
};

/**
 * Numeric input with a unit dropdown. The context stores the CANONICAL value
 * (engine units); this component shows/edits it in the user's chosen display
 * unit and converts on every keystroke. Local text state keeps typing smooth —
 * it resyncs from the canonical value when the field is not focused (e.g. a
 * registry patch, project load, or unit-system toggle changed it).
 */
const UnitInput = ({ label, field, canonicalValue, displayUnit, unitSystem, onValueChange, onUnitChange, hint }) => {
    const options = INPUT_UNIT_OPTIONS[field] || [];
    const [text, setText] = useState('');
    const [focused, setFocused] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (!focused) {
            setText(displayRound(fromCanonical(field, parseFloat(canonicalValue), displayUnit, unitSystem)));
        }
    }, [canonicalValue, displayUnit, unitSystem, focused, field]);

    const handleChange = (raw) => {
        setText(raw);
        const parsed = parseFloat(raw);
        onValueChange(isFinite(parsed) ? toCanonical(field, parsed, displayUnit, unitSystem) : 0);
    };

    return (
        <div className="space-y-1">
            <Label className="text-xs">{label}</Label>
            <div className="flex gap-1.5">
                <Input
                    ref={inputRef}
                    type="number"
                    value={text}
                    onChange={e => handleChange(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    className="h-8 bg-slate-900 flex-1"
                />
                <Select value={displayUnit} onValueChange={onUnitChange}>
                    <SelectTrigger className="h-8 w-[110px] text-[10px] bg-slate-950 border-slate-700 flex-shrink-0">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map(o => (
                            <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
        </div>
    );
};

export default UnitInput;
