// VRR-U1: the derived model (workspace.js), its honesty fixes with the old
// behaviour as negative control, and the units with one known value per
// conversion.
import { deriveVrr, checkFvf, resolveSettings } from '../workspace';
import { vrrUnits, inputText, inputStore } from '../units';
import { parseVrrWellCSV, vrrTemplateCSV } from '../csvImport';
import { defaultInputs } from '@/contexts/VrrMonitorContext';
import {
  computeVRRSeries, summarizeVRR, buildPatternPeriods, buildFieldPeriods, attachPressure,
} from '@/utils/vrrCalculations';
import { derivePeriodFvf } from '../pvtTrack';

const ledger = () => ({ ...defaultInputs(), mode: 'imported', wellRows: parseVrrWellCSV(vrrTemplateCSV()).rows });
const surveys = [{ date: '2025-01-15', p_psia: 3000 }, { date: '2025-03-15', p_psia: 1800 }];

describe('VRR-U1-008: a blank or mistyped FVF withholds the VRR', () => {
  it('blank Bo: withheld with the reason, no summary, every flag null', () => {
    const inputs = { ...ledger(), fvf: { Bo: '', Bw: '1.02', Bg: '0.9', Rs: '550' } };
    const d = deriveVrr(inputs);
    expect(d.withheld).toMatch(/Bo "" is not a number/);
    expect(d.summary).toBeNull();
    expect(d.flags.every((f) => f === null)).toBe(true);
    // negative control: the engine reads the blank as 0 and the ratio jumps
    const s = summarizeVRR(computeVRRSeries(buildFieldPeriods(inputs.wellRows), inputs.fvf));
    expect(s.cumulativeVRR).toBeGreaterThan(4);
  });
  it('"1,25" is not 1', () => {
    expect(checkFvf({ Bo: '1,25', Bw: '1', Bg: '1', Rs: '0' }).errors[0]).toMatch(/Bo "1,25" is not a number/);
    expect(checkFvf({ Bo: '1.25', Bw: '1', Bg: '0', Rs: '0' }).errors[0]).toMatch(/Bg must be above zero/);
    expect(checkFvf({ Bo: '1.25', Bw: '1', Bg: '1', Rs: '0' }).ok).toBe(true);
  });
});

describe('VRR-U1-009: patterns and their advice carry the per-period FVFs of the field', () => {
  const ALL = { id: 'all', name: 'Whole field', producers: ['P-1', 'P-2'] };
  const ALLOC = { 'I-1': { 'P-1': '0.6', 'P-2': '0.4' }, 'I-2': { 'P-1': '1' } };
  const inputs = { ...ledger(), pressureSurveys: surveys, pvtMode: 'track', patterns: [ALL], allocation: ALLOC };
  const d = deriveVrr(inputs);
  it('one pattern holding every producer equals the field, period by period', () => {
    expect(d.pvt.active).toBe(true);
    const a = d.patternAnalyses[0];
    a.series.forEach((p, i) => expect(p.cumulativeVRR).toBeCloseTo(d.series[i].cumulativeVRR, 12));
    expect(a.recommendation.currentVRR).toBeCloseTo(d.rolling[d.rolling.length - 1], 12);
  });
  it('negative control: the old pattern path (constant FVFs) disagreed with the field', () => {
    const old = computeVRRSeries(buildPatternPeriods(inputs.wellRows, ALL, { 'I-1': { 'P-1': 0.6, 'P-2': 0.4 }, 'I-2': { 'P-1': 1 } }), inputs.fvf);
    expect(Math.abs(old[2].cumulativeVRR - d.series[2].cumulativeVRR)).toBeGreaterThan(0.005);
  });
});

describe('VRR-U1-016: the correlation track needs every fluid input', () => {
  it('a blank gas gravity keeps the constant set and says why', () => {
    const d = deriveVrr({ ...ledger(), pressureSurveys: surveys, pvtMode: 'track', fluid: { ...defaultInputs().fluid, gasSg: '' } });
    expect(d.pvt.active).toBe(false);
    expect(d.pvt.withheld).toMatch(/missing: Gas gravity/);
    // negative control: the old bridge filled 0.7 silently
    const per = attachPressure(buildFieldPeriods(ledger().wellRows), surveys).map((p) => p.pressure);
    expect(derivePeriodFvf({ ...defaultInputs().fluid, gasSg: '' }, per).overrides[0]).not.toBeNull();
  });
});

describe('VRR-U1-017: settings say what was used', () => {
  it('0 and blanks and a reversed band', () => {
    const r = resolveSettings({ targetBandMin: '1.2', targetBandMax: '0.9', rollingWindow: '0' });
    expect(r.targetBand).toEqual({ min: 0.9, max: 1.2 });
    expect(r.windowPeriods).toBe(3);
    expect(r.notes.join(' ')).toMatch(/swapped/);
    expect(r.notes.join(' ')).toMatch(/Rolling window "0" is not usable; 3 is used/);
    expect(resolveSettings({ targetBandMin: '0' }).targetBand.min).toBe(0); // the old reader made 0 into 1.0
  });
});

describe('units: one known value per conversion (the saved values stay oilfield)', () => {
  const si = vrrUnits('si');
  it.each([
    ['oil', 1, 0.158987294928], // 1 STB = 0.158987 sm3
    ['water', 1000, 158.987294928],
    ['gas', 1, 0.028316846592], // 1 Mscf = 0.0283168 10^3 sm3
    ['reservoir', 62865, 9994.73], // the sample's produced voidage
    ['pressure', 3000, 20684.271879505], // psia to kPa
    ['bo', 1.25, 1.25],
    ['bg', 0.9, 0.00505313], // RB/Mscf to rm3/sm3
    ['rs', 550, 97.959184], // scf/STB to sm3/sm3
    ['temperature', 180, 82.2222],
    ['depth', 8000, 2438.4],
  ])('%s %p shows as %p', (kind, value, expected) => {
    expect(si.show(kind, value)).toBeCloseTo(expected, kind === 'reservoir' ? 1 : 4);
    expect(si.store(kind, si.show(kind, value))).toBeCloseTo(value, 8);
  });
  it('typing in SI stores oilfield; partial text never reaches state; oilfield keeps the text', () => {
    expect(inputStore('pressure', '20684.271879505', 'si')).toBe('3000');
    expect(Number(inputStore('bg', '0.00505313', 'si'))).toBeCloseTo(0.9, 5);
    expect(inputStore('pressure', '2068.', 'si')).toBe(String(parseFloat((2068 / 6.894757293168361).toPrecision(12))));
    expect(inputStore('pressure', '-', 'si')).toBeNull();
    expect(inputStore('pressure', '3000.', 'oilfield')).toBe('3000.');
    expect(inputText('rs', '550', 'si')).toBe('97.95918');
    expect(inputText('rs', '', 'si')).toBe('');
  });
  it('the profile picks the system of a new workspace; a project saved before VRR-U1 opens in oilfield', () => {
    expect(defaultInputs('si').unitSystem).toBe('si');
    // eslint-disable-next-line global-require
    const { inputsFromPayload } = require('@/contexts/VrrMonitorContext');
    expect(inputsFromPayload({ inputs: { fvf: { Bo: '1.3' } } }).unitSystem).toBe('oilfield');
  });
});
