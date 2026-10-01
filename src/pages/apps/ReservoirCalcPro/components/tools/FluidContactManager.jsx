import React, { useState, useEffect, useRef } from 'react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { useUnitProfile } from '@/lib/units/UnitProfileContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Droplets, ArrowDown } from 'lucide-react';
import { INPUT_UNIT_OPTIONS, toCanonical, fromCanonical, defaultInputUnits } from '../../services/unitsCatalog';

// Fluid contacts (RC2, 2026-09-06): OWC and GOC are TVDSS elevations,
// negative below the datum, the registry convention every surface
// follows. They are typed in a display unit (ft or m) that defaults to
// the account's Geoscience depth unit and is remembered with the project
// (inputUnits.contact); the context keeps the canonical value in the
// unit system's length unit.

const displayRound = (v) => (v === null || v === undefined || !isFinite(v) ? '' : String(parseFloat(Number(v).toPrecision(8))));

const FluidContactManager = () => {
    const { state, updateInputs, setInputUnit, backend } = useReservoirCalc();
    const { fluidType, owc, goc } = state.inputs;
    const unitSystem = state.unitSystem || 'field';
    const unit = state.inputUnits?.contact || defaultInputUnits(unitSystem).contact;
    const [localOwc, setLocalOwc] = useState('');
    const [localGoc, setLocalGoc] = useState('');
    const focusedRef = useRef(null);

    // the Suite unit profile's depth sets the contact display unit once, on
    // a fresh workspace (without a profile provider: the account's legacy
    // Geoscience depth unit, as before)
    const profile = useUnitProfile();
    const appliedRef = useRef(false);
    useEffect(() => {
        if (appliedRef.current || state.project?.id) return;
        if (profile.available) {
            if (!profile.ready) return;
            appliedRef.current = true;
            const u = profile.units.depth;
            if (u === 'm' || u === 'ft') setInputUnit('contact', u);
            return;
        }
        if (!backend?.getDepthUnit) return;
        appliedRef.current = true;
        backend.getDepthUnit().then((u) => { if (u === 'm' || u === 'ft') setInputUnit('contact', u); }).catch(() => {});
    }, [backend, state.project?.id, setInputUnit, profile.available, profile.ready, profile.units]);

    useEffect(() => {
        if (focusedRef.current !== 'owc') setLocalOwc(displayRound(fromCanonical('contact', parseFloat(owc), unit, unitSystem)));
    }, [owc, unit, unitSystem]);
    useEffect(() => {
        if (focusedRef.current !== 'goc') setLocalGoc(displayRound(fromCanonical('contact', parseFloat(goc), unit, unitSystem)));
    }, [goc, unit, unitSystem]);

    const handleCommit = (field, value) => {
        const parsed = value === '' ? null : parseFloat(value);
        updateInputs({ [field]: parsed === null || !isFinite(parsed) ? null : toCanonical('contact', parsed, unit, unitSystem) });
    };
    const handleKeyDown = (e, field, value) => {
        if (e.key === 'Enter') { handleCommit(field, value); e.target.blur(); }
    };

    const contactInput = (id, field, local, setLocal, color, label) => (
        <div className="space-y-1">
            <Label htmlFor={id} className={`text-xs ${color}`}>{label}</Label>
            <div className="relative">
                <Input
                    id={id}
                    type="number"
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                    onFocus={() => { focusedRef.current = field; }}
                    onBlur={() => { focusedRef.current = null; handleCommit(field, local); }}
                    onKeyDown={(e) => handleKeyDown(e, field, local)}
                    className="h-8 pr-8 text-right font-mono text-xs"
                    placeholder={`elevation (${unit})`}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none opacity-50">
                    <ArrowDown className="w-3 h-3 text-pl-muted" />
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-pl-text">
                <Droplets className="w-3 h-3 text-pl-muted" /> FLUID CONTACTS
                <select className="ml-auto rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1 py-0.5 text-[10px]" data-testid="rcp-contact-unit"
                    value={unit} title="Contact depth unit (TVDSS elevation). Starts from your Suite units on a new project."
                    onChange={(e) => setInputUnit('contact', e.target.value)}>
                    {INPUT_UNIT_OPTIONS.contact.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </div>
            <Card className="p-2 space-y-2">
                {(fluidType === 'oil' || fluidType === 'oil_gas') && contactInput('owc-input', 'owc', localOwc, setLocalOwc, 'text-pl-muted', `OWC (Oil-Water), TVDSS ${unit}`)}
                {(fluidType === 'gas' || fluidType === 'oil_gas') && contactInput('goc-input', 'goc', localGoc, setLocalGoc, 'text-pl-muted', `${fluidType === 'gas' ? 'GWC (Gas-Water)' : 'GOC (Gas-Oil)'}, TVDSS ${unit}`)}
                <div className="text-[10px] text-pl-muted italic mt-1 px-1" data-testid="rcp-contact-note">
                    Elevation below the datum (TVDSS): negative numbers, deeper is more negative, the same convention as the registry surfaces.
                </div>
                {state.inputMethod === 'simple' && (
                    <div className="text-[10px] text-pl-warning-text mt-1 px-1" data-testid="rcp-contact-simple">
                        The Simple method has no structure, so these contacts do not change the volume. Use Hybrid or Surfaces to cut the structure at the contacts{fluidType === 'oil_gas' ? ', or the gas-cap fraction (Fluid tab) to split oil and gas' : ''}.
                    </div>
                )}
            </Card>
        </div>
    );
};

export default FluidContactManager;
