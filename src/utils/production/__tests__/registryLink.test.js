// Gates for the P1 wellsRegistry linkage: key normalization, UWI over
// name precedence, ambiguity refusal, already-linked wells untouched.
import { normalizeWellKey, suggestRegistryLinks } from '../registryLink';

describe('normalizeWellKey', () => {
  it('collapses separators, case and leading zeros', () => {
    expect(normalizeWellKey('P-01')).toBe('P1');
    expect(normalizeWellKey('p 1')).toBe('P1');
    expect(normalizeWellKey('P_001')).toBe('P1');
    expect(normalizeWellKey('OKORO-012ST')).toBe('OKORO12ST');
    expect(normalizeWellKey('  ')).toBe('');
    expect(normalizeWellKey(null)).toBe('');
  });

  it('keeps significant zeros', () => {
    expect(normalizeWellKey('P-10')).toBe('P10');
    expect(normalizeWellKey('P-100')).toBe('P100');
  });
});

describe('suggestRegistryLinks', () => {
  const geo = [
    { id: 'g1', name: 'P-1', uwi: 'NG/001' },
    { id: 'g2', name: 'P-2', uwi: null },
    { id: 'g3', name: 'I-1', uwi: 'NG/003' },
  ];

  it('matches by UWI first, then by normalized name', () => {
    const po = [
      { id: 'a', name: 'Well P1', uwi: 'NG-0-01' },  // uwi key NG1 == NG/001
      { id: 'b', name: 'p 2', uwi: null },
    ];
    expect(suggestRegistryLinks(po, geo)).toEqual([
      { poWellId: 'a', geoWellId: 'g1', basis: 'uwi' },
      { poWellId: 'b', geoWellId: 'g2', basis: 'name' },
    ]);
  });

  it('refuses ambiguous keys and unmatched wells', () => {
    const geoDup = [...geo, { id: 'g4', name: 'P 2', uwi: null }];
    const po = [
      { id: 'b', name: 'P-2', uwi: null },     // two registry wells key P2
      { id: 'c', name: 'P-99', uwi: null },    // no match
    ];
    expect(suggestRegistryLinks(po, geoDup)).toEqual([]);
  });

  it('leaves already-linked wells alone', () => {
    const po = [{ id: 'a', name: 'P-1', uwi: null, geo_well_id: 'g9' }];
    expect(suggestRegistryLinks(po, geo)).toEqual([]);
  });
});
