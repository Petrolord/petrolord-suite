// Unit-selection correctness: per-field display-unit conversion, the
// convert-on-toggle path (Field↔Metric), and result display volumes.
import { UnitConversionEngine } from '../UnitConversionEngine';
import {
    canonicalUnitFor, defaultInputUnits, toCanonical, fromCanonical,
    convertInputsOnSystemChange, distScaleFactor,
    convertResultVolume, defaultResultUnits
} from '../unitsCatalog';

describe('UnitConversionEngine — extended factors', () => {
    test('area: hectares and mi² round-trip through acres', () => {
        expect(UnitConversionEngine.convert(1, 'ha', 'acre', 'area')).toBeCloseTo(2.47105, 4);
        expect(UnitConversionEngine.convert(640, 'acre', 'sq_mi', 'area')).toBeCloseTo(1, 10);
        expect(UnitConversionEngine.convert(1, 'km2', 'sq_m', 'area')).toBeCloseTo(1e6, 3);
    });

    test('gas FVF conventions: rb/scf and rb/Mscf fold 5.614583 ft³/bbl', () => {
        // 0.83 rb/Mscf is a typical PVT-report Bg → 0.00466 rcf/scf
        expect(UnitConversionEngine.convert(0.83, 'rb_mscf', 'rcf_scf', 'gasFVF')).toBeCloseTo(0.00466, 5);
        expect(UnitConversionEngine.convert(0.005, 'rcf_scf', 'rb_scf', 'gasFVF')).toBeCloseTo(0.005 / 5.614583, 8);
        // rm³/sm³ is numerically identical to rcf/scf
        expect(UnitConversionEngine.convert(0.005, 'rm3_sm3', 'rcf_scf', 'gasFVF')).toBe(0.005);
    });

    test('temperature C↔F↔K', () => {
        expect(UnitConversionEngine.convert(82.22, 'C', 'F', 'temperature')).toBeCloseTo(180, 1);
        expect(UnitConversionEngine.convert(355.37, 'K', 'F', 'temperature')).toBeCloseTo(180, 1);
    });
});

describe('unitsCatalog — canonical boundary conversion', () => {
    test('canonical units follow the unit system for geometry only', () => {
        expect(canonicalUnitFor('area', 'field')).toBe('acre');
        expect(canonicalUnitFor('area', 'metric')).toBe('km2');
        expect(canonicalUnitFor('thickness', 'metric')).toBe('m');
        // Bg / pressure / temperature are stored system-independently
        expect(canonicalUnitFor('bg', 'metric')).toBe('rcf_scf');
        expect(canonicalUnitFor('pressure', 'metric')).toBe('psi');
        expect(canonicalUnitFor('temperature', 'metric')).toBe('F');
    });

    test('toCanonical: area entered in m² lands in acres (field system)', () => {
        expect(toCanonical('area', 4046.8564224, 'sq_m', 'field')).toBeCloseTo(1, 8);
    });

    test('toCanonical: Bg entered in rb/Mscf lands in rcf/scf', () => {
        expect(toCanonical('bg', 0.83, 'rb_mscf', 'field')).toBeCloseTo(0.00466, 5);
    });

    test('toCanonical: metric pressure in bar lands in psi', () => {
        expect(toCanonical('pressure', 241.3166, 'bar', 'metric')).toBeCloseTo(3500, 0);
    });

    test('fromCanonical inverts toCanonical for every option', () => {
        for (const [field, unit] of [['area', 'ha'], ['thickness', 'm'], ['bg', 'rb_scf'], ['pressure', 'kpa'], ['temperature', 'C']]) {
            const canon = toCanonical(field, 123.45, unit, 'field');
            expect(fromCanonical(field, canon, unit, 'field')).toBeCloseTo(123.45, 6);
        }
    });

    test('default display units track the system', () => {
        expect(defaultInputUnits('field')).toMatchObject({ area: 'acre', thickness: 'ft', pressure: 'psi', temperature: 'F' });
        expect(defaultInputUnits('metric')).toMatchObject({ area: 'km2', thickness: 'm', pressure: 'bar', temperature: 'C' });
    });
});

describe('convertInputsOnSystemChange — toggle preserves the physical case', () => {
    const fieldInputs = { area: 5000, thickness: 50, owc: -8000, goc: -7000, fvf: 1.2, bg: 0.005, porosity: 0.2 };

    test('field → metric converts geometry, leaves ratios alone', () => {
        const m = convertInputsOnSystemChange(fieldInputs, 'field', 'metric');
        expect(m.area).toBeCloseTo(20.2343, 3);      // 5000 acres in km²
        expect(m.thickness).toBeCloseTo(15.24, 3);   // 50 ft in m
        expect(m.owc).toBeCloseTo(-2438.4, 2);
        expect(m.goc).toBeCloseTo(-2133.6, 2);
        expect(m.fvf).toBe(1.2);
        expect(m.bg).toBe(0.005);
        expect(m.porosity).toBe(0.2);
    });

    test('round trip returns the original values', () => {
        const back = convertInputsOnSystemChange(convertInputsOnSystemChange(fieldInputs, 'field', 'metric'), 'metric', 'field');
        expect(back.area).toBeCloseTo(5000, 6);
        expect(back.thickness).toBeCloseTo(50, 6);
        expect(back.owc).toBeCloseTo(-8000, 6);
    });

    test('the converted case computes the same STOOIP', () => {
        // 5000 ac × 50 ft × 7758 / 1.2 (phi .2, sw .3, ntg 1) vs km²/m path — the
        // physical barrels must match within float noise (identical constants).
        const { VolumeCalculationEngine } = require('../VolumeCalculationEngine');
        const f = VolumeCalculationEngine.calculateDeterministic(fieldInputs, 'field', 'simple', {});
        const m = VolumeCalculationEngine.calculateDeterministic(
            convertInputsOnSystemChange(fieldInputs, 'field', 'metric'), 'metric', 'simple', {});
        const stbFromMetric = m.stooip / 0.158987; // sm³ → STB
        expect(stbFromMetric / f.stooip).toBeCloseTo(1, 3);
    });

    test('distScaleFactor matches the input conversion', () => {
        expect(distScaleFactor('area', 'field', 'metric')).toBeCloseTo(20.2343 / 5000, 6);
        expect(distScaleFactor('thickness', 'field', 'metric')).toBeCloseTo(0.3048, 10);
        expect(distScaleFactor('porosity', 'field', 'metric')).toBe(1);
    });
});

describe('result display volumes', () => {
    test('STOOIP STB → MMSTB and sm³', () => {
        expect(convertResultVolume(25_000_000, 'STB', 'MMSTB', 'oil')).toBeCloseTo(25, 10);
        expect(convertResultVolume(1_000_000, 'STB', 'sm3', 'oil')).toBeCloseTo(158_987, 0);
    });

    test('GIIP scf → Bscf and sm³; metric sm³ → Bscf', () => {
        expect(convertResultVolume(3.5e9, 'scf', 'Bscf', 'gas')).toBeCloseTo(3.5, 10);
        expect(convertResultVolume(1e9, 'scf', 'MMsm3', 'gas')).toBeCloseTo(28.3168, 3);
        expect(convertResultVolume(2.83168e7, 'sm³', 'Bscf', 'gas')).toBeCloseTo(1, 4);
    });

    test('defaults reproduce the legacy display', () => {
        expect(defaultResultUnits('field')).toEqual({ oil: 'STB', gas: 'Bscf' });
        expect(defaultResultUnits('metric')).toEqual({ oil: 'sm3', gas: 'Bsm3' });
    });
});
