/**
 * AppUpgrade PETRO-U2-010: saturation-height from SCAL Studio's saved
 * functions. The Sw at a height is SCAL Studio's own forward chain
 * (makeJFunction, pcFromJ with the Leverett 1941 scaling, heightFromPc)
 * inverted by bisection; the forward chain is gated in the engines repo
 * against the Leverett 1941 goldens.
 *
 * Validation: a hand example worked independently (Python, 2026-09-29) with
 * SCAL Studio's default rock and J (a 0.25, b 1.4, Swirr 0.15; k 150 mD,
 * phi 0.22, sigma 26 dyn/cm, theta 30 deg; gamma 1.05 and 0.80): at 100 ft
 * above the FWL, Pc = 100 x 0.4335 x 0.25 = 10.8375 psi, J = 2.72030,
 * Sw = 0.304502; and a round trip through every row of SCAL Studio's own
 * swVsHeight profile.
 *
 * Negative controls (run 2026-09-29): with the bisection's direction
 * reversed the hand example and the round trip fail; with the height taken
 * as TVDSS minus FWL (sign flipped) every sample above the FWL reads 1.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { swVsHeight } from '@/utils/scalCalculations';
import { buildJSpec, DEFAULT_CAPILLARY } from '@/contexts/ScalStudioContext';
import { shmFromScalProject, swAtHeight, shmCurve, shmZoneComparison } from '../services/saturationHeight';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import PetroWorkstation from '../components/PetroWorkstation';

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

const project = {
  name: 'P', schema: 1, samples: [],
  capillary: { ...DEFAULT_CAPILLARY },
  height: { gammaW: '1.05', gammaHc: '0.80', fwl_tvdss: '6000' },
};

test('the project reads through SCAL Studio\'s own builders', () => {
  const shm = shmFromScalProject(project);
  expect(shm.ok).toBe(true);
  expect(shm.jSpec).toEqual(buildJSpec(project.capillary, []).jSpec);
  expect(shm.reservoir).toEqual({ k_md: 150, phi: 0.22, sigma_dyncm: 26, thetaDeg: 30 });
  expect(shm.fwlTvdssM).toBeCloseTo(6000 * 0.3048, 9);
  expect(shmFromScalProject({ ...project, height: { gammaW: '0.8', gammaHc: '1.0' } }).errors[0]).toMatch(/water gradient above/);
  expect(shmFromScalProject({}).ok).toBe(false);
});

test('hand example at 100 ft above the FWL', () => {
  const shm = shmFromScalProject(project);
  expect(swAtHeight(shm.jSpec, shm.reservoir, shm.fluids, 100)).toBeCloseTo(0.30450244384574077, 9);
  expect(swAtHeight(shm.jSpec, shm.reservoir, shm.fluids, 0)).toBe(1);
  expect(swAtHeight(shm.jSpec, shm.reservoir, shm.fluids, -5)).toBe(1);
});

test('round trip through SCAL Studio\'s own saturation-height profile', () => {
  const shm = shmFromScalProject(project);
  const prof = swVsHeight(shm.jSpec, shm.reservoir, shm.fluids, { n: 30, SwMin: 0.2, SwMax: 0.95 });
  expect(prof.ok).toBe(true);
  for (const r of prof.rows) expect(swAtHeight(shm.jSpec, shm.reservoir, shm.fluids, r.h_ft)).toBeCloseTo(r.Sw, 8);
});

test('on a vertical well: Sw rises toward the FWL and is 1 below it; per-sample rock from the logs', () => {
  const shm = shmFromScalProject(project);
  const fwl = 2000;
  const depth = Float64Array.from({ length: 41 }, (_, i) => 1960 + i * 2 + 30); // MD, KB 30: TVDSS 1960..2040
  const well = { kb_m: 30, deviation: [], td_md_m: 2100 };
  const r = shmCurve({ shm, depth, well, fwlTvdssM: fwl });
  expect(r.ok).toBe(true);
  for (let i = 1; i < 20; i++) expect(r.data[i]).toBeGreaterThanOrEqual(r.data[i - 1]);
  expect(r.data[20]).toBe(1);
  expect(r.data[40]).toBe(1);
  const hFt = (fwl - 1960) / 0.3048;
  expect(r.data[0]).toBeCloseTo(swAtHeight(shm.jSpec, shm.reservoir, shm.fluids, hFt), 12);
  const tight = shmCurve({ shm, depth, well, fwlTvdssM: fwl, rock: 'logs', outputs: { KPERM: new Float64Array(41).fill(1.5), PHIE: new Float64Array(41).fill(0.22) } });
  expect(tight.data[0]).toBeGreaterThan(r.data[0]); // lower k, higher Sw at the same height
  const cmp = shmZoneComparison({ depth, sw: new Float64Array(41).fill(0.5), swShm: r.data, zones: [{ id: 'z', top_md_m: 1990, base_md_m: 2010 }] });
  expect(cmp.z.n).toBe(11);
  expect(cmp.z.logSw).toBeCloseTo(0.5, 12);
  expect(shmCurve({ shm: { ...shm, fwlTvdssM: null }, depth, well }).reason).toMatch(/No free-water level/);
});

test('workstation: pick the SCAL project, compute, compare by zone, show on tracks', async () => {
  const backend = makeInMemoryBackend();
  render(<MemoryRouter><PetroWorkstation backend={backend} /></MemoryRouter>);
  const rows = await screen.findAllByTestId('petro-well-row', {}, { timeout: 30000 });
  fireEvent.click(rows.find((r) => /KETA TYPE-1/.test(r.textContent)));
  await screen.findByTestId('petro-zone-net-SAND A', {}, { timeout: 30000 });
  fireEvent.click(screen.getByTestId('petro-shm'));
  await waitFor(() => expect(screen.getByTestId('petro-shm-fwl').value).toBe('2060'), { timeout: 30000 });
  expect(screen.getByTestId('petro-shm-function').textContent).toMatch(/J = 0\.250/);
  fireEvent.click(screen.getByTestId('petro-shm-run'));
  await waitFor(() => expect(screen.getByTestId('petro-shm-row-SAND A').textContent).toMatch(/0\.\d{3}/), { timeout: 60000 });
  expect(screen.getByTestId('petro-status').textContent).toMatch(/Saturation-height Sw computed from Keta SAND J/);
  fireEvent.click(screen.getByTestId('petro-shm-tracks'));
  await waitFor(() => expect(screen.getByTestId('petro-status').textContent).toMatch(/saturation-height layout is active/), { timeout: 30000 });
}, 400000);
