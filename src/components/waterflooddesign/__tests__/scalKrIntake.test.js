/**
 * SC5 — SCAL -> Waterflood kr intake mapper (navigate-state contract).
 */
import { mapScalKrIntake } from '../scalKrIntake';

const COREY = {
  source: 'SCAL demo',
  krSource: 'corey',
  corey: { Swc: 0.2, Sor: 0.25, krwMax: 0.35, kroMax: 0.9, nw: 2.5, no: 2.0 },
  muW: 0.5,
  muO: 5,
};

describe('mapScalKrIntake', () => {
  it('maps a corey payload to string form-state patch with viscosities', () => {
    const mapped = mapScalKrIntake(COREY);
    expect(mapped.patch).toEqual({
      krSource: 'corey',
      Swc: '0.2', Sor: '0.25', krwMax: '0.35', kroMax: '0.9', nw: '2.5', no: '2',
      muW: '0.5', muO: '5',
    });
    expect(mapped.note).toMatch(/SCAL demo/);
  });

  it('maps a table payload through validateKrTable', () => {
    const mapped = mapScalKrIntake({
      krSource: 'table',
      table: [
        { Sw: 0.2, krw: 0, kro: 0.9 },
        { Sw: 0.5, krw: 0.08, kro: 0.3 },
        { Sw: 0.75, krw: 0.35, kro: 0 },
      ],
    });
    expect(mapped.patch.krSource).toBe('table');
    expect(mapped.patch.krTable).toHaveLength(3);
  });

  it('rejects unusable payloads with null (no partial application)', () => {
    expect(mapScalKrIntake(null)).toBeNull();
    expect(mapScalKrIntake({ krSource: 'corey', corey: { Swc: 0.7, Sor: 0.5, krwMax: 0.3, kroMax: 0.9, nw: 2, no: 2 } })).toBeNull();
    expect(mapScalKrIntake({ krSource: 'table', table: [{ Sw: 0.5, krw: 0.5, kro: 0.5 }] })).toBeNull();
    expect(mapScalKrIntake({ krSource: 'let' })).toBeNull();
  });

  it('omits non-positive viscosities instead of writing garbage strings', () => {
    const mapped = mapScalKrIntake({ ...COREY, muW: null, muO: -1 });
    expect(mapped.patch.muW).toBeUndefined();
    expect(mapped.patch.muO).toBeUndefined();
  });
});
