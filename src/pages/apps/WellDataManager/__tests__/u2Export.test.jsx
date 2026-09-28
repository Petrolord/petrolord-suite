/**
 * WDM-U2-002: LAS, tops CSV and survey CSV export in the display unit.
 *
 * Validation is a round trip through the Suite's own doors: the exported
 * LAS re-imported by parseLas + the registry door gives the SAME float32
 * samples (every curve bit for bit; the depth bit for bit in metres and
 * within one float32 step in feet, see below); the tops and survey CSVs
 * re-imported by the paste door (which reads "MD (ft)" off the header) give
 * the same depths. PL3: every depth column names its unit.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { parseLas } from '../engine/lasParse';
import { prepareLasForRegistry } from '../engine/lasIndex';
import { buildWellLas, topsCsv, surveyCsv, lasExportPlan } from '../engine/wellExport';
import { makeDepthFrame } from '../engine/checkshots';
import { parseDelimited, guessMapping, guessMdUnit, buildTops, buildDeviation } from '@/lib/wellImport';
import WellDataManager from '../WellDataManager';

jest.setTimeout(30000);

const mockDownloads = [];
jest.mock('@/lib/fullPrecision', () => ({
  ...jest.requireActual('@/lib/fullPrecision'),
  downloadText: (name, text) => { mockDownloads.push({ name, text }); return true; },
}));
let mockBackend = null;
jest.mock('../services/registryBackend', () => ({ makeRegistryBackend: () => mockBackend }));
const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');

const HOSTILE = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'wdm', 'hostile');
const SAVED = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'wdm', 'saved');
const savedRows = (f) => JSON.parse(fs.readFileSync(path.join(SAVED, f), 'utf8'));

/** A registry well from a hostile file, the way the door stores it. */
function wellFromLas(file) {
  const parsed = parseLas(fs.readFileSync(path.join(HOSTILE, file), 'utf8'));
  const { prep } = prepareLasForRegistry(parsed, { sourceFile: file });
  const logs = prep.logs.map((l, i) => ({
    id: `log-${i}`, mnemonic: l.mnemonic, unit: l.unit, description: l.description, start_md_m: l.startMdM, stop_md_m: l.stopMdM,
    step_m: l.stepM, n_samples: l.nSamples, null_count: l.nullCount, provenance: l.provenance,
  }));
  const data = new Map(prep.logs.map((l, i) => [`log-${i}`, Float32Array.from(l.data)]));
  const well = { id: 'w1', name: 'EXPORT, TEST "1"', uwi: 'U-1', kb_m: 25.3, td_md_m: 1600, surface_x: 512345.6, surface_y: 498765.4, crs: 'EPSG:26391', xy_unit: 'm', deviation: [] };
  return { well, logs, data };
}

const bits = (a) => Array.from(new Uint32Array(Float32Array.from(a).buffer));

describe('LAS round trip (validation)', () => {
  for (const file of ['las20_petrel_export.las', 'las20_upward_feet.las', 'las20_slb_tdep_upward.las']) {
    for (const unit of ['m', 'ft']) {
      test(`${file} exported in ${unit} re-imports to the same float32 samples`, () => {
        const { well, logs, data } = wellFromLas(file);
        const out = buildWellLas({ well, logs, data, unit, date: '2026-09-28', build: 'test' });
        expect(out.fileName).toBe('EXPORT_TEST_1.las');
        const back = prepareLasForRegistry(parseLas(out.text), { sourceFile: out.fileName }).prep;
        expect(back.logs.map((l) => l.mnemonic)).toEqual(['DEPT', ...logs.slice(1).map((l) => l.mnemonic)]);
        // curve values are written as stored: identical bits in both units
        for (let i = 1; i < logs.length; i++) {
          expect(bits(back.logs[i].data)).toEqual(bits(data.get(logs[i].id)));
        }
        // depth: identical bits in metres. In feet the reader casts the feet
        // value to float32 BEFORE the exact 0.3048 (vendored parser), so a
        // metre-born depth can come back one float32 step away (0.24 mm at
        // 2,000 m), never more.
        const d0 = bits(data.get(logs[0].id));
        const d1 = bits(back.logs[0].data);
        if (unit === 'm') expect(d1).toEqual(d0);
        else d1.forEach((b, k) => expect(Math.abs(b - d0[k])).toBeLessThanOrEqual(1));
        expect(back.depthUnit.toUpperCase()).toBe(unit === 'ft' ? 'F' : 'M');
        // the header carries the well identity, KB in the file unit and the CRS
        expect(out.text).toMatch(/WELL\s*\.\s+EXPORT, TEST "1"/);
        expect(out.text).toMatch(new RegExp(`EKB\\s*\\.${unit === 'ft' ? 'F' : 'M'}\\s+${unit === 'ft' ? '83.00524' : '25.3'}`));
        expect(out.text).toMatch(/CRS\s*\.\s+EPSG 26391|CRS\s*\.\s+EPSG:26391/);
      });
    }
  }

  test('only the ticked curves are written; a curve on another grid is named with its reason', () => {
    const { well, logs, data } = wellFromLas('las20_petrel_export.las');
    const odd = { ...logs[1], id: 'odd', mnemonic: 'GR_CORE', n_samples: 3, start_md_m: 1500, stop_md_m: 1501 };
    const plan = lasExportPlan([...logs, odd]);
    expect(plan.skipped).toEqual([{ mnemonic: 'GR_CORE', reason: expect.stringMatching(/another depth grid/) }]);
    const out = buildWellLas({ well, logs: [...logs, odd], data, selectedIds: [logs[0].id, logs[2].id], unit: 'm', date: '2026-09-28' });
    expect(out.included).toEqual([logs[2].mnemonic]);
    expect(prepareLasForRegistry(parseLas(out.text)).prep.logs.map((l) => l.mnemonic)).toEqual(['DEPT', logs[2].mnemonic]);
  });

  test('a well with no depth curve refuses with the reason', () => {
    expect(() => buildWellLas({ well: { name: 'X' }, logs: [], data: new Map() })).toThrow(/no depth curve/);
  });
});

describe('tops and survey CSV (validation through the paste door)', () => {
  const well = {
    name: 'CSV-1', uwi: null, kb_m: 24.99,
    deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 1000, inc: 20, azi: 45 }, { md: 2200, inc: 35, azi: 60 }],
  };
  const tops = [
    { id: 't2', name: 'Base, Seal', md_m: 1688.123456, surface_type: 'formation_top' },
    { id: 't1', name: 'Top Dome', md_m: 1502.5, interpreter: 'ama' },
  ];

  for (const unit of ['m', 'ft']) {
    test(`tops CSV in ${unit}: header names the unit and re-imports the same MD`, () => {
      const { text, fileName } = topsCsv(well, tops, unit);
      expect(fileName).toBe('CSV-1_tops.csv');
      const p = parseDelimited(text);
      expect(p.header.slice(3, 6)).toEqual([`MD (${unit})`, `TVD (${unit})`, `TVDSS (${unit})`]);
      expect(guessMdUnit(p.header, ['name', 'md'])).toBe(unit);
      const back = buildTops(p.rows, guessMapping(p.header, ['name', 'md']), { mdUnit: unit });
      expect(back.map((t) => t.name)).toEqual(['Top Dome', 'Base, Seal']);
      if (unit === 'm') expect(back.map((t) => t.md)).toEqual([1502.5, 1688.123456]);
      else back.forEach((t, i) => expect(Math.abs(t.md - [1502.5, 1688.123456][i])).toBeLessThan(1e-9));
      // TVD column is the engine's minimum-curvature TVD
      const frame = makeDepthFrame({ deviation: well.deviation, kbM: well.kb_m });
      const tvd = Number(p.rows[0][4]) * (unit === 'ft' ? 0.3048 : 1);
      expect(tvd).toBeCloseTo(frame.mdToPosition(1502.5).tvd, 6);
    });

    test(`survey CSV in ${unit}: stations re-import, TVD and offsets from the engine`, () => {
      const { text } = surveyCsv(well, unit);
      const p = parseDelimited(text);
      expect(p.header[0]).toBe(`MD (${unit})`);
      expect(p.header[5]).toBe(`East offset (${unit})`);
      const map = guessMapping(p.header, ['md', 'inc', 'azi']);
      const back = buildDeviation(p.rows, map, { mdUnit: guessMdUnit(p.header) });
      back.forEach((s, i) => {
        expect(Math.abs(s.md - well.deviation[i].md)).toBeLessThan(1e-9);
        expect(s.inc).toBe(well.deviation[i].inc);
        expect(s.azi).toBe(well.deviation[i].azi);
      });
      const pos = makeDepthFrame({ deviation: well.deviation, kbM: well.kb_m }).mdToPosition(2200);
      const f = unit === 'ft' ? 0.3048 : 1;
      expect(Number(p.rows[2][3]) * f).toBeCloseTo(pos.tvd, 6);
      expect(Number(p.rows[2][5]) * f).toBeCloseTo(pos.x, 6);
      expect(Number(p.rows[2][6]) * f).toBeCloseTo(pos.y, 6);
    });
  }

  test('a vertical well has no survey to export, and says so', () => {
    expect(() => surveyCsv({ name: 'V', deviation: [] }, 'm')).toThrow(/treated as vertical/);
  });
});

describe('the Export dialog', () => {
  const noopCtx = () => new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 0 }) : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  beforeAll(() => {
    installDomShims();
    jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(noopCtx);
  });

  test('exports LAS and tops of a saved G1 well in feet', async () => {
    window.localStorage.setItem('petrolord.wdm.displayUnit.v1:anon', 'ft');
    mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: savedRows('registry-g1-2026-07.json') });
    render(<MemoryRouter><WellDataManager /></MemoryRouter>);
    const rows = await screen.findAllByTestId('wdm-well-row');
    fireEvent.click(rows.find((r) => r.textContent.includes('LEGACY G1-7')));
    const detail = await screen.findByTestId('wdm-detail');
    fireEvent.click(within(detail).getByRole('button', { name: /^Logs/ }));
    await screen.findByTestId('wdm-logs-table');
    fireEvent.click(screen.getByTestId('wdm-export'));
    const dialog = await screen.findByTestId('wdm-export-dialog');
    expect(within(dialog).getByText(/Depths in feet/)).toBeInTheDocument();
    expect(within(dialog).getByTestId('wdm-export-curve-GR')).toBeChecked();
    fireEvent.click(screen.getByTestId('wdm-export-download'));
    await waitFor(() => expect(mockDownloads.length).toBe(1));
    expect(mockDownloads[0].name).toBe('LEGACY_G1-7.las');
    expect(mockDownloads[0].text).toMatch(/DEPT\s*\.F/);
    expect(await screen.findByTestId('wdm-status-message')).toHaveTextContent('LAS written with 1 curve, depths in ft');

    fireEvent.click(screen.getByTestId('wdm-export'));
    fireEvent.click(await screen.findByTestId('wdm-export-format-tops'));
    fireEvent.click(screen.getByTestId('wdm-export-download'));
    await waitFor(() => expect(mockDownloads.length).toBe(2));
    expect(mockDownloads[1].text.split('\n')[0]).toContain('MD (ft)');

    fireEvent.click(screen.getByTestId('wdm-export'));
    fireEvent.click(await screen.findByTestId('wdm-export-format-survey'));
    expect(screen.getByTestId('wdm-export-download')).not.toBeDisabled();
  });
});
