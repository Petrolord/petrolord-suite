import { UnitConversionEngine } from './UnitConversionEngine';

// Per-field unit choice for the analytic inputs. state.inputs values are
// ALWAYS stored in the engine's canonical unit for the active unit system
// (field: acres / ft; metric: km² / m) — or in a system-independent canonical
// for fluid/reservoir-condition fields (Bg: rcf/scf ≡ rm³/sm³, pressure: psi,
// temperature: °F, the units FluidPropertyLibrary's correlations consume).
// The UI converts at the input boundary via toCanonical/fromCanonical, so the
// calculation engines never see a non-canonical number.

export const INPUT_UNIT_OPTIONS = {
    area: [
        { value: 'acre', label: 'acres' },
        { value: 'km2', label: 'km²' },
        { value: 'ha', label: 'ha' },
        { value: 'sq_m', label: 'm²' },
        { value: 'sq_ft', label: 'ft²' },
        { value: 'sq_mi', label: 'mi²' }
    ],
    thickness: [
        { value: 'ft', label: 'ft' },
        { value: 'm', label: 'm' }
    ],
    bg: [
        { value: 'rcf_scf', label: 'rcf/scf (= rm³/sm³)' },
        { value: 'rb_scf', label: 'rb/scf' },
        { value: 'rb_mscf', label: 'rb/Mscf' }
    ],
    pressure: [
        { value: 'psi', label: 'psi' },
        { value: 'bar', label: 'bar' },
        { value: 'kpa', label: 'kPa' },
        { value: 'mpa', label: 'MPa' }
    ],
    temperature: [
        { value: 'F', label: '°F' },
        { value: 'C', label: '°C' },
        { value: 'K', label: 'K' }
    ]
};

// Conversion type each field routes through in UnitConversionEngine.
const FIELD_TYPE = {
    area: 'area',
    thickness: 'length',
    bg: 'gasFVF',
    pressure: 'pressure',
    temperature: 'temperature'
};

/** Canonical storage unit for a field under the given unit system. */
export function canonicalUnitFor(field, unitSystem) {
    const isField = unitSystem !== 'metric';
    switch (field) {
        case 'area': return isField ? 'acre' : 'km2';
        case 'thickness': return isField ? 'ft' : 'm';
        case 'bg': return 'rcf_scf'; // ≡ rm³/sm³, system-independent
        case 'pressure': return 'psi';
        case 'temperature': return 'F';
        default: return null;
    }
}

/** Default display units when a project is created or the system toggles. */
export function defaultInputUnits(unitSystem) {
    const isField = unitSystem !== 'metric';
    return {
        area: isField ? 'acre' : 'km2',
        thickness: isField ? 'ft' : 'm',
        bg: 'rcf_scf',
        pressure: isField ? 'psi' : 'bar',
        temperature: isField ? 'F' : 'C'
    };
}

/** Display-unit value → canonical storage value. */
export function toCanonical(field, value, displayUnit, unitSystem) {
    const canonical = canonicalUnitFor(field, unitSystem);
    if (!canonical || displayUnit === canonical) return value;
    return UnitConversionEngine.convert(value, displayUnit, canonical, FIELD_TYPE[field]);
}

/** Canonical storage value → display-unit value. */
export function fromCanonical(field, value, displayUnit, unitSystem) {
    const canonical = canonicalUnitFor(field, unitSystem);
    if (!canonical || displayUnit === canonical) return value;
    return UnitConversionEngine.convert(value, canonical, displayUnit, FIELD_TYPE[field]);
}

const isNum = (v) => typeof v === 'number' && isFinite(v);

/**
 * Convert the canonical inputs when the Field/Metric system toggles, so the
 * physical case is preserved instead of silently reinterpreted (the historical
 * behaviour turned 5000 acres into 5000 km²). Bo/Bg are dimensionless ratios
 * and pressure/temperature are stored system-independently, so only the
 * geometric fields move: area (acre↔km²), thickness + contacts (ft↔m).
 */
export function convertInputsOnSystemChange(inputs, fromSystem, toSystem) {
    if (fromSystem === toSystem) return inputs;
    const next = { ...inputs };
    if (isNum(parseFloat(next.area))) {
        next.area = UnitConversionEngine.convert(
            parseFloat(next.area), canonicalUnitFor('area', fromSystem), canonicalUnitFor('area', toSystem), 'area');
    }
    const lenFrom = canonicalUnitFor('thickness', fromSystem);
    const lenTo = canonicalUnitFor('thickness', toSystem);
    for (const key of ['thickness', 'owc', 'goc']) {
        const v = parseFloat(next[key]);
        if (isNum(v)) next[key] = UnitConversionEngine.convert(v, lenFrom, lenTo, 'length');
    }
    return next;
}

/** Multiplicative factor a distribution parameter scales by on system toggle. */
export function distScaleFactor(paramKey, fromSystem, toSystem) {
    if (fromSystem === toSystem) return 1;
    if (paramKey === 'area') {
        return UnitConversionEngine.convert(1, canonicalUnitFor('area', fromSystem), canonicalUnitFor('area', toSystem), 'area');
    }
    if (paramKey === 'thickness' || paramKey === 'owc' || paramKey === 'goc') {
        return UnitConversionEngine.convert(1, canonicalUnitFor('thickness', fromSystem), canonicalUnitFor('thickness', toSystem), 'length');
    }
    return 1;
}

// ---------------------------------------------------------------------------
// Result display units. Engine outputs are canonical surface volumes:
// oil in STB (field) or sm³ (metric); gas in scf (field) or sm³ (metric).
// Conversion here is display-only and never touches stored results.

const M3_PER_BBL = 0.158987;
const M3_PER_SCF = 0.0283168;

export const OIL_RESULT_UNITS = [
    { value: 'STB', label: 'STB', perCanon: { STB: 1, 'sm³': 1 / M3_PER_BBL } },
    { value: 'MMSTB', label: 'MMSTB', perCanon: { STB: 1e-6, 'sm³': 1e-6 / M3_PER_BBL } },
    { value: 'sm3', label: 'sm³', perCanon: { STB: M3_PER_BBL, 'sm³': 1 } },
    { value: 'MMsm3', label: 'MMsm³', perCanon: { STB: M3_PER_BBL * 1e-6, 'sm³': 1e-6 } }
];

export const GAS_RESULT_UNITS = [
    { value: 'scf', label: 'scf', perCanon: { scf: 1, 'sm³': 1 / M3_PER_SCF } },
    { value: 'MMscf', label: 'MMscf', perCanon: { scf: 1e-6, 'sm³': 1e-6 / M3_PER_SCF } },
    { value: 'Bscf', label: 'Bscf', perCanon: { scf: 1e-9, 'sm³': 1e-9 / M3_PER_SCF } },
    { value: 'sm3', label: 'sm³', perCanon: { scf: M3_PER_SCF, 'sm³': 1 } },
    { value: 'MMsm3', label: 'MMsm³', perCanon: { scf: M3_PER_SCF * 1e-6, 'sm³': 1e-6 } },
    { value: 'Bsm3', label: 'Bsm³', perCanon: { scf: M3_PER_SCF * 1e-9, 'sm³': 1e-9 } }
];

/**
 * Convert a canonical result volume for display.
 * @param {number} value        engine output
 * @param {'STB'|'scf'|'sm³'} canonicalUnit  the engine's volumeUnit for this result
 * @param {string} displayUnit  a value from OIL_/GAS_RESULT_UNITS
 * @param {'oil'|'gas'} phase
 */
export function convertResultVolume(value, canonicalUnit, displayUnit, phase) {
    const table = phase === 'gas' ? GAS_RESULT_UNITS : OIL_RESULT_UNITS;
    const entry = table.find(u => u.value === displayUnit);
    const factor = entry?.perCanon?.[canonicalUnit];
    if (!isNum(factor)) return value;
    return (value ?? 0) * factor;
}

export function resultUnitLabel(displayUnit, phase) {
    const table = phase === 'gas' ? GAS_RESULT_UNITS : OIL_RESULT_UNITS;
    return table.find(u => u.value === displayUnit)?.label || displayUnit;
}

/** Defaults that reproduce the pre-selector display. */
export function defaultResultUnits(unitSystem) {
    const isField = unitSystem !== 'metric';
    return { oil: isField ? 'STB' : 'sm3', gas: isField ? 'Bscf' : 'Bsm3' };
}
