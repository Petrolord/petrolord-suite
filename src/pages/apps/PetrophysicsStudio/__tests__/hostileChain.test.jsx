/**
 * AppUpgrade PETRO-U1, PL2 + PL9: one physical well written the ways
 * vendors write it (e2e/fixtures/petro/hostile, see generate.mjs) goes
 * through the REAL Well Data Manager door (parse, orient, prepare, merge)
 * and is read by Petrophysics Studio's input path (mapLogs + inputCurves)
 * and pipeline. Every variant must give the reference file's porosity,
 * Sw and net pay.
 *
 * Negative control (run 2026-09-28): with inputCurves replaced by the
 * pre-fix raw read, the IP (PU, -999.00 inside the sand), Techlog
 * (kg/m3), Petrel (percent labelled v/v), LAS 3.0 (PU) and bottom-up (%)
 * cases fail on NPHI and PHIT; the IP case's zone porosity averages over
 * about 12 because the undeclared null reads as a density porosity of 607.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { makeInMemoryBackend as makeWdmBackend } from '@/pages/apps/WellDataManager/services/inMemoryBackend';
import { planMerge } from '@/pages/apps/WellDataManager/engine/mergeImport';
import { mapLogs, candidatesFor } from '@/components/wells/curveMap';
import { inputCurves, normalizeInputCurve } from '@/components/wells/curveUnits';
import { makeInMemoryBackend as makePetroBackend } from '../services/inMemoryBackend';
import PetroWorkstation from '../components/PetroWorkstation';
import { computeWell, DEFAULT_PARAMS } from '../engine/pipeline';
import { zoneReport } from '../services/zoneAverages';

const HOSTILE = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'petro', 'hostile');
const file = (name) => ({ name, text: async () => fs.readFileSync(path.join(HOSTILE, name), 'utf8') });
const OIL = { top_md_m: 1525, base_md_m: 1549.5 };

async function importNewWell(b, name) {
  const { meta, prep } = await b.parseLasFile(file(name));
  const well = await b.saveWell({ name: meta.suggestedHeader.name, surfaceX: 0, surfaceY: 0, kbM: 0, tdMdM: meta.suggestedHeader.tdMdM });
  const keep = Object.fromEntries(prep.logs.map((l) => [l.mnemonic, true]));
  await b.saveLogs(well.id, planMerge({ prepLogs: prep.logs, keep }).logs);
  return well;
}

async function readAsPetro(b, wellId) {
  const logs = await b.listLogs(wellId);
  const mapped = mapLogs(logs);
  const raw = {};
  for (const l of logs) raw[l.mnemonic] = await b.downloadCurve(l);
  const { curves, notes } = inputCurves(mapped, raw);
  return { logs, mapped, curves, notes };
}

const meanIn = (depth, arr, top, base) => {
  let s = 0; let n = 0;
  for (let i = 0; i < depth.length; i++) {
    if (depth[i] > top + 0.3 && depth[i] < base - 0.3 && Number.isFinite(arr[i])) { s += arr[i]; n += 1; }
  }
  return s / n;
};

const VARIANTS = ['ip_export_ft_percent.las', 'techlog_tdep_kgm3.las', 'petrel_mislabelled_units.las', 'las30_comma_pu.las', 'bottom_up_ft_percent.las'];
let wdm; const wells = {};
beforeAll(async () => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  wdm = makeWdmBackend({ seedSharedWell: false });
  for (const name of ['reference_si.las', ...VARIANTS, 'geolog_names.las']) wells[name] = await importNewWell(wdm, name);
});

describe('one well, six vendor spellings, one answer', () => {
  let ref;
  beforeAll(async () => {
    const r = await readAsPetro(wdm, wells['reference_si.las'].id);
    const { outputs } = computeWell(r.curves, DEFAULT_PARAMS);
    ref = { ...r, outputs, zone: zoneReport(r.curves, outputs, DEFAULT_PARAMS, OIL) };
    expect(r.notes).toEqual([]);
    expect(meanIn(r.curves.DEPT, outputs.PHIT, OIL.top_md_m, OIL.base_md_m)).toBeCloseTo(0.25, 4);
    expect(ref.zone.net_m).toBeGreaterThan(20);
  });

  test.each(VARIANTS)('%s', async (name) => {
    const r = await readAsPetro(wdm, wells[name].id);
    for (const key of ['DEPT', 'GR', 'RT', 'RHOB', 'NPHI']) expect(r.mapped[key]).toBeTruthy();
    const d = r.curves.DEPT;
    expect(meanIn(d, r.curves.NPHI, OIL.top_md_m, OIL.base_md_m)).toBeCloseTo(0.25, 3);
    expect(meanIn(d, r.curves.RHOB, OIL.top_md_m, OIL.base_md_m)).toBeCloseTo(2.2375, 3);
    const { outputs } = computeWell(r.curves, DEFAULT_PARAMS);
    expect(meanIn(d, outputs.PHIT, OIL.top_md_m, OIL.base_md_m)).toBeCloseTo(0.25, 3);
    expect(meanIn(d, outputs.SW, OIL.top_md_m, OIL.base_md_m)).toBeCloseTo(0.25, 2);
    const z = zoneReport(r.curves, outputs, DEFAULT_PARAMS, OIL);
    expect(z.phi_avg).toBeCloseTo(ref.zone.phi_avg, 3);
    expect(z.sw_avg).toBeCloseTo(ref.zone.sw_avg, 2);
    // feet sampling lands the zone edges on different samples: one sample
    // either side, plus the one undeclared null in the IP file's sand
    expect(Math.abs(z.net_m - ref.zone.net_m)).toBeLessThanOrEqual(1.0 + 1e-9);
    if (name !== 'techlog_tdep_kgm3.las') expect(r.notes.join(' ')).toMatch(/NPHI/);
  });

  test('the IP file: its undeclared -999.00 in the sand is a null, and said so', async () => {
    const r = await readAsPetro(wdm, wells['ip_export_ft_percent.las'].id);
    expect(r.notes.join(' ')).toMatch(/RHOB: 1 sample at -999 or below read as null/);
    expect(r.notes.join(' ')).toMatch(/NPHI is in PU: divided by 100/);
    const { outputs } = computeWell(r.curves, DEFAULT_PARAMS);
    let worst = 0;
    for (const v of outputs.PHIT) if (Number.isFinite(v)) worst = Math.max(worst, v);
    expect(worst).toBeLessThan(0.4);
  });

  test('kg/m3 density is converted by its unit; a mislabelled percent NPHI by its values', async () => {
    const tl = await readAsPetro(wdm, wells['techlog_tdep_kgm3.las'].id);
    expect(tl.notes.join(' ')).toMatch(/RHOZ is in K\/M3: divided by 1000/);
    const pe = await readAsPetro(wdm, wells['petrel_mislabelled_units.las'].id);
    expect(pe.notes.join(' ')).toMatch(/NPHI values run to 35\.0, which only percent can mean \(the file labels them v\/v\)/);
  });
});

// PETRO-U2-001 (closes PETRO-U1-030): the Geolog / Paradigm names map
// automatically and the well gives the reference answer. Negative control
// (run 2026-09-29): without the two aliases NPHI and RT stay unmapped, SW
// is missing and the zone has no net pay.
test('Geolog names: NEU and RES_DEEP auto-map and give the reference net pay', async () => {
  const r = await readAsPetro(wdm, wells['geolog_names.las'].id);
  expect(r.mapped.NPHI.mnemonic).toBe('NEU');
  expect(r.mapped.RT.mnemonic).toBe('RES_DEEP');
  expect(candidatesFor('NPHI', r.logs).map((l) => l.mnemonic)).toContain('NEU');
  const ref = await readAsPetro(wdm, wells['reference_si.las'].id);
  const zr = zoneReport(ref.curves, computeWell(ref.curves, DEFAULT_PARAMS).outputs, DEFAULT_PARAMS, OIL);
  const zg = zoneReport(r.curves, computeWell(r.curves, DEFAULT_PARAMS).outputs, DEFAULT_PARAMS, OIL);
  expect(zg.net_m).toBeCloseTo(zr.net_m, 9);
  expect(zg.sw_avg).toBeCloseTo(zr.sw_avg, 9);
});

test('normalizeInputCurve leaves clean SI curves and non-physical keys untouched', () => {
  const data = Float64Array.from([0.2, 0.25, -0.01]);
  expect(normalizeInputCurve('NPHI', { unit: 'V/V' }, data)).toMatchObject({ data, notes: [], decision: { readAs: 'V/V', factor: 1, reason: 'file' } });
  const sp = Float64Array.from([-1200, -40]);
  expect(normalizeInputCurve('SP', { unit: 'MV' }, sp).data).toBe(sp);
});

test('the workstation says what it converted when the IP well opens', async () => {
  const backend = {
    ...makePetroBackend(),
    listWells: wdm.listWells, listLogs: wdm.listLogs, downloadCurve: wdm.downloadCurve,
    listTops: wdm.listTops, listIntervals: wdm.listIntervals, listZones: async () => [],
  };
  render(<MemoryRouter><PetroWorkstation backend={backend} /></MemoryRouter>);
  const rows = await screen.findAllByTestId('petro-well-row');
  fireEvent.click(rows.find((row) => row.textContent.includes('PETRO IP-2')));
  await waitFor(() => expect(screen.getByTestId('petro-status').textContent).toMatch(/NPHI is in PU: divided by 100 to v\/v/));
  expect(screen.getByTestId('petro-status').textContent).toMatch(/read as null/);
}, 30000);
