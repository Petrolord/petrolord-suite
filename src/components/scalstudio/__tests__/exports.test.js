/**
 * SC5 — Export tab pure builders: CSV content and the Waterflood handoff
 * payload.
 */
import {
  buildKrCsv, buildHeightCsv, buildPcCsv, buildScalKrHandoff,
} from '../exports';

const OW = { Swc: 0.2, Sor: 0.25, krwMax: 0.35, kroMax: 0.9, nw: 2.5, no: 2.0 };

describe('CSV builders', () => {
  it('kr CSV has the header, n+1 rows and the exact endpoints', () => {
    const csv = buildKrCsv(OW, 25);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Sw,krw,kro');
    expect(lines).toHaveLength(27);
    expect(lines[1]).toBe('0.2000,0.00000,0.90000');
    expect(lines[26]).toBe('0.7500,0.35000,0.00000');
  });

  it('height CSV carries TVDSS only when a FWL is given', () => {
    const profile = [
      { h_ft: 5, Sw: 0.9, Pc_psi: 0.6 },
      { h_ft: 50, Sw: 0.4, Pc_psi: 6.1 },
    ];
    const noFwl = buildHeightCsv(profile, null).split('\n');
    expect(noFwl[0]).toBe('h_ft,Sw,Pc_psi');
    const withFwl = buildHeightCsv(profile, 8200).split('\n');
    expect(withFwl[0]).toBe('h_ft,tvdss_ft,Sw,Pc_psi');
    expect(withFwl[1]).toBe('5.00,8195.00,0.9000,0.6000');
  });

  it('Pc CSV round-trips the rows', () => {
    const csv = buildPcCsv([{ Sw: 0.3, Pc_psi: 12.5 }]);
    expect(csv.split('\n')).toEqual(['Sw,Pc_psi', '0.3000,12.5000']);
  });

  it('builders return null with nothing to export', () => {
    expect(buildKrCsv(null)).toBeNull();
    expect(buildHeightCsv([], null)).toBeNull();
    expect(buildPcCsv(null)).toBeNull();
  });
});

describe('buildScalKrHandoff', () => {
  it('wraps the working set in the navigate-state contract', () => {
    const payload = buildScalKrHandoff({ owParams: OW, projectName: 'Field X SCAL', muW: 0.5, muO: 5 });
    expect(payload).toEqual({
      source: 'Field X SCAL',
      krSource: 'corey',
      corey: { Swc: 0.2, Sor: 0.25, krwMax: 0.35, kroMax: 0.9, nw: 2.5, no: 2.0 },
      muW: 0.5,
      muO: 5,
    });
  });

  it('returns null without a valid working set', () => {
    expect(buildScalKrHandoff({ owParams: null })).toBeNull();
  });
});
