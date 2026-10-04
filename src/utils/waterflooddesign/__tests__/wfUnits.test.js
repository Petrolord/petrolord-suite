// WF-U1 units (PL3, RL7): one known value pinned per conversion, not a round trip only
// (the Well Test SI storage lesson: a round trip cannot see a wrong factor).
import { wfUnits, inputStore, inputText } from '@/utils/waterflooddesign/units';

const si = wfUnits('si');
const oil = wfUnits('oilfield');

describe('known values', () => {
  it.each([
    ['length', 100, 30.48],
    ['area', 40, 16.1874256],
    ['flowArea', 50000, 4645.152],
    ['resRate', 1000, 158.987295],
    ['oilRate', 1000, 158.987295],
    ['gasRate', 1, 28.3168466],
    ['gor', 500, 89.0538],
    ['fvfOil', 1.25, 1.25],
    ['fvfGas', 0.9, 0.00505313],
    ['pressure', 2000, 13789.5146],
    ['oilVolume', 1, 0.158987295],
    ['oilVolumeK', 661.5, 105.17],
    ['hallSlope', 2, 86.7334],
    ['hallIntegral', 1000, 6894.757],
  ])('%s: %s oilfield is %s SI', (kind, v, expected) => {
    expect(si.show(kind, v)).toBeCloseTo(expected, expected > 100 ? 1 : expected < 0.1 ? 7 : 3);
    expect(si.store(kind, si.show(kind, v))).toBeCloseTo(v, 9);
    expect(oil.show(kind, v)).toBe(v);
  });
  it('labels follow the system', () => {
    expect(si.head('Bo', 'fvfOil')).toBe('Bo (rm3/sm3)');
    expect(oil.head('Bg', 'fvfGas')).toBe('Bg (RB/Mscf)');
    expect(si.label('hallSlope')).toBe('kPa.d/m3');
  });
});

describe('typing', () => {
  it('oilfield keeps text as typed; SI converts numbers only', () => {
    expect(inputStore('length', '2.', 'oilfield')).toBe('2.');
    expect(inputStore('length', '-', 'si')).toBeNull();
    expect(inputStore('length', '30.48', 'si')).toBe('100');
    expect(inputStore('length', '30,48', 'si')).toBe('100');
    expect(inputStore('length', '', 'si')).toBe('');
    expect(inputText('length', '100', 'si')).toBe('30.48');
    expect(inputText('viscosity', '5', 'si')).toBe('5');
  });
});
