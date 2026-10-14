/**
 * 2026-10-14: (1) a pore pressure well under hydrostatic is said, on the
 * Ekene-1 kit well through the shipped path (every-sample Eaton reads the
 * sands far under hydrostatic; shale samples do not); (2) the depth readout
 * moves into a well shallower than its 3,500 m default.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims, installDashboardScope } from '@/design/testing/themeAssertions';
import { parseLas } from '../../WellDataManager/engine/lasParse';
import { normalizePpCurves, buildProfileInput } from '../services/prep';
import { autoShalePicks, fitSegments } from '../services/shalePicks';
import { computePrognosis } from '../services/shalePressure';
import { underpressure, inputNotes } from '../services/honesty';
import PPWorkstation from '../components/PPWorkstation';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
installDashboardScope({ userId: null });
beforeEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); });

function ekene1() {
  const p = parseLas(fs.readFileSync(path.join(__dirname, 'fixtures', 'ekene-1-pp.las'), 'utf8'));
  const c = Object.fromEntries(p.curves.map((x) => [x.mnemonic.toUpperCase(), x]));
  const norm = normalizePpCurves({ depth: c.DEPT.data, dt: c.DT.data, rho: c.RHOB.data, dtLog: { mnemonic: 'DT', unit: c.DT.unit }, rhoLog: { mnemonic: 'RHOB', unit: c.RHOB.unit } });
  const input = { ...buildProfileInput({ depth: norm.depth, dt: norm.dt, rho: norm.rho, shale: Array.from(c.GR.data) }, norm.units, { mudlineMdM: 60 }), shaleKind: 'gr' };
  const fit = fitSegments(autoShalePicks(input, { trend: 'dt', cutoff: 60, fromM: 100, toM: 1230, everyM: 30.48 }), { dtMlUsPerM: 656, dtMaUsPerM: 220, cPerM: 6e-4 }, []);
  const params = { waterDepthM: 35, rhoSeawaterKgM3: 1025, rhoFluidKgM3: 1030, mudlineMdM: 60, nct: fit.nct, method: 'eaton', eatonN: 3, nu: 0.3, shaleCutoff: 82, shaleCutoffKind: 'gr' };
  return { input, params };
}

describe('underpressure note', () => {
  const E = ekene1();
  test('every-sample Eaton reads the sands far under hydrostatic, and the note says so', () => {
    const r = computePrognosis(E.input, { ...E.params, ppFromShale: false });
    const u = underpressure(E.input, r, E.params);
    expect(u.count).toBeGreaterThan(100);
    expect(u.worstPpg).toBeGreaterThan(3);
    const note = inputNotes({ input: E.input, result: r, params: E.params, nctFitted: true, fmtZ: (m) => `${Math.round(m / 0.3048)} ft` }).find((n) => n.key === 'underpressure');
    expect(note.tone).toBe('warn');
    expect(note.text).toMatch(/^Pore pressure more than 0.5 ppg below hydrostatic over \d+ ft of the well \(up to \d+\.\d ppg below, at \d+ ft below mudline\)/);
  });
  test('negative control: shale-sample pressures on the same well raise no note', () => {
    const r = computePrognosis(E.input, { ...E.params, ppFromShale: true });
    expect(underpressure(E.input, r, E.params)).toBeNull();
    expect(inputNotes({ input: E.input, result: r, params: E.params, nctFitted: true }).some((n) => n.key === 'underpressure')).toBe(false);
  });
  test('hydrostatic exactly is not underpressure; the top 30 m is not read', () => {
    const z = [0, 10, 20, 40, 80];
    const ph = z.map((d) => 1e4 * (d + 35));
    expect(underpressure({ zBmlM: z }, { porePressurePa: ph, hydrostaticPa: ph }, { waterDepthM: 35 })).toBeNull();
    const pp = ph.map((v, i) => (i < 3 ? v * 0.2 : v));
    expect(underpressure({ zBmlM: z }, { porePressurePa: pp, hydrostaticPa: ph }, { waterDepthM: 35 })).toBeNull();
  });
});

test('the readout moves into a well shallower than its default depth', async () => {
  const b = makeInMemoryBackend();
  const N = 201; // the top 2,000 m of the harness well
  const short = { ...b, async downloadCurve(log) { const v = await b.downloadCurve(log); return v.slice(0, N); } };
  render(<MemoryRouter><PPWorkstation backend={short} /></MemoryRouter>);
  fireEvent.click(await screen.findByTestId('pp-well-row', {}, { timeout: 15000 }));
  await waitFor(() => expect(screen.getByTestId('pp-readout-pp')).toBeInTheDocument(), { timeout: 10000 });
  const depthFt = Number(screen.getByTestId('pp-readout-depth').value);
  // 2,000 m below mudline in the harness's display unit (ft or m)
  expect([2000, 6561.7]).toContainEqual(Math.round(depthFt * 10) / 10);
});
