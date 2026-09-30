/**
 * AppUpgrade PETRO-U2-007 (PETRO-U1-032): core overlay and a core-calibrated
 * poro-perm transform, log10 k = a + b phi by least squares (Nelson 1994).
 *
 * Gates call the shipped fit: an independent oracle (Python's
 * statistics.linear_regression and correlation, run 2026-09-29 on the six
 * plugs below: a = -1.5694185913715073, b = 15.79858217300032,
 * R2 = 0.9988737449235634), exact recovery of a noiseless transform, the
 * refusals, and the chain from the hostile core file through Well Data
 * Manager's merge (12 plugs in percent) to the Studio's reader.
 *
 * Negative controls (run 2026-09-29): fitting k instead of log10 k fails
 * the oracle case; with the percent check removed the hostile core reads
 * porosities of 24 v/v and the chain case fails.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { makeInMemoryBackend as makeWdm } from '@/pages/apps/WellDataManager/services/inMemoryBackend';
import { planMerge, findDepthLog } from '@/pages/apps/WellDataManager/engine/mergeImport';
import { fitPoroPerm, corePoints, zoneFits, coreTwins, kFromFit, findCoreLogs } from '../services/coreData';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import PetroWorkstation from '../components/PetroWorkstation';

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

const HOSTILE = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'petro', 'hostile');
const file = (name) => ({ name, text: async () => fs.readFileSync(path.join(HOSTILE, name), 'utf8') });

test('the fit matches an independent oracle', () => {
  const phi = [0.12, 0.15, 0.18, 0.21, 0.24, 0.27];
  const k = [2.1, 6.5, 18.0, 61.0, 150.0, 520.0];
  const f = fitPoroPerm(phi.map((p, i) => ({ phi: p, k: k[i] })));
  expect(f.ok).toBe(true);
  expect(f.a).toBeCloseTo(-1.5694185913715073, 12);
  expect(f.b).toBeCloseTo(15.79858217300032, 11);
  expect(f.r2).toBeCloseTo(0.9988737449235634, 12);
  expect(f.n).toBe(6);
});

test('a noiseless transform is recovered exactly; refusals say why', () => {
  const pts = [0.1, 0.14, 0.2, 0.26].map((phi) => ({ phi, k: 10 ** (-2 + 18 * phi) }));
  const f = fitPoroPerm(pts);
  expect(f.a).toBeCloseTo(-2, 12);
  expect(f.b).toBeCloseTo(18, 11);
  expect(f.r2).toBeCloseTo(1, 12);
  expect(kFromFit(f, 0.2)).toBeCloseTo(10 ** 1.6, 9);
  expect(fitPoroPerm(pts.slice(0, 2)).reason).toMatch(/2 plugs .* 3 needed/);
  expect(fitPoroPerm([{ phi: 0.2, k: 1 }, { phi: 0.2, k: 2 }, { phi: 0.2, k: 3 }]).reason).toMatch(/same porosity/);
  expect(fitPoroPerm([{ phi: 0.2, k: 0 }, { phi: 0.1, k: -1 }, { phi: 0.3, k: NaN }]).ok).toBe(false);
});

test('per-zone fits and K_CORE: each zone its own transform, the well fit elsewhere', () => {
  const depth = Float64Array.from({ length: 40 }, (_, i) => 100 + i);
  const points = [];
  for (let i = 0; i < 40; i += 2) {
    const phi = 0.1 + (i % 10) * 0.01;
    const k = i < 20 ? 10 ** (-1 + 10 * phi) : 10 ** (-3 + 20 * phi);
    points.push({ i, depth: depth[i], phi, k });
  }
  const zones = [{ id: 'u', name: 'U', top_md_m: 100, base_md_m: 119 }, { id: 'l', name: 'L', top_md_m: 120, base_md_m: 139 }];
  const fits = zoneFits(points, zones);
  expect(fits.zones.u.b).toBeCloseTo(10, 10);
  expect(fits.zones.l.b).toBeCloseTo(20, 10);
  const phie = new Float64Array(40).fill(0.2);
  const t = coreTwins({ depth, points, fits, zones, phie });
  expect(t.K_CORE[5]).toBeCloseTo(10, 8);
  expect(t.K_CORE[25]).toBeCloseTo(10, 8);
  expect(Number.isFinite(t.CORE_PHI[2])).toBe(true);
  expect(Number.isNaN(t.CORE_PHI[3])).toBe(true);
});

test('chain: the hostile routine-core file through the WDM merge reads as 12 plugs in v/v', async () => {
  const b = makeWdm({ seedSharedWell: false });
  const ref = await b.parseLasFile(file('reference_si.las'));
  const well = await b.saveWell({ name: 'REF', surfaceX: 0, surfaceY: 0, kbM: 0, tdMdM: 1600 });
  await b.saveLogs(well.id, planMerge({ prepLogs: ref.prep.logs, keep: Object.fromEntries(ref.prep.logs.map((l) => [l.mnemonic, true])) }).logs);
  const core = await b.parseLasFile(file('core_routine_plugs.las'));
  const existing = await b.listLogs(well.id);
  const dl = findDepthLog(existing);
  const depth = await b.downloadCurve(dl);
  const plan = planMerge({ prepLogs: core.prep.logs, keep: Object.fromEntries(core.prep.logs.map((l) => [l.mnemonic, true])), existingLogs: existing, existingDepth: { log: dl, data: depth } });
  await b.saveLogs(well.id, plan.logs);
  const allLogs = await b.listLogs(well.id);
  const logs = {};
  for (const l of allLogs) logs[l.mnemonic] = await b.downloadCurve(l);
  expect(findCoreLogs(allLogs).phi.mnemonic).toBe('CPOR');
  const r = corePoints({ depth: Float64Array.from(depth), allLogs, logs });
  const both = r.points.filter((p) => Number.isFinite(p.phi) && Number.isFinite(p.k));
  expect(both.length).toBeGreaterThanOrEqual(12);
  expect(r.notes.join(' ')).toMatch(/CPOR is in %: divided by 100/);
  for (const p of both) { expect(p.phi).toBeGreaterThan(0.2); expect(p.phi).toBeLessThan(0.3); expect(p.k).toBeGreaterThan(100); }
});

test('workstation: Core… shows the plugs and the fits; Show on tracks activates the layout', async () => {
  const backend = makeInMemoryBackend();
  render(<MemoryRouter><PetroWorkstation backend={backend} /></MemoryRouter>);
  const rows = await screen.findAllByTestId('petro-well-row', {}, { timeout: 30000 });
  fireEvent.click(rows.find((r) => /KETA TYPE-1/.test(r.textContent)));
  await screen.findByTestId('petro-zone-net-SAND A', {}, { timeout: 30000 });
  fireEvent.click(screen.getByTestId('petro-core'));
  expect(screen.getByTestId('petro-core-found').textContent).toMatch(/Core curves: CPOR, CKH/);
  expect(screen.getAllByTestId('petro-core-plug').length).toBeGreaterThan(5);
  expect(screen.getByTestId('petro-core-fit-SAND A').textContent).toMatch(/0\.\d{3}/);
  fireEvent.click(screen.getByTestId('petro-core-tracks'));
  await waitFor(() => expect(screen.getByTestId('petro-status').textContent).toMatch(/Core calibration layout is active/));
}, 400000);
