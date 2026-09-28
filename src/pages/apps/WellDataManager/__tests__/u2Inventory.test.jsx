/**
 * WDM-U2-006: registry inventory and QC flags. Every flag is exercised by a
 * well that raises it and by a clean well that must not (negative control),
 * the saved G1 release is flagged for its bottom-up curves, and the view
 * filters by flag and opens a well.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { registryInventory, wellInventory, QC_FLAGS, inventoryCsv, majorityFrame } from '../engine/inventory';
import WellDataManager from '../WellDataManager';

jest.setTimeout(30000);

let mockBackend = null;
jest.mock('../services/registryBackend', () => ({ makeRegistryBackend: () => mockBackend }));
const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');

const SAVED = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'wdm', 'saved');
const savedRows = (f) => JSON.parse(fs.readFileSync(path.join(SAVED, f), 'utf8'));

const CLEAN = {
  id: 'c', name: 'CLEAN-1', surface_x: 500000, surface_y: 6700000, crs: 'EPSG:32631', kb_m: 25, td_md_m: 2500,
  deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 2500, inc: 10, azi: 90 }], checkshots: [],
};
const log = (wellId, mnemonic, over = {}) => ({ well_id: wellId, id: `${wellId}-${mnemonic}`, mnemonic, start_md_m: 1000, stop_md_m: 2000, step_m: 0.1524, n_samples: 6563, ...over });
const top = (wellId, name, md) => ({ well_id: wellId, id: `${wellId}-${name}`, name, md_m: md });

describe('QC flags (engine)', () => {
  const cleanLogs = [log('c', 'DEPT'), log('c', 'GR')];
  const cleanTops = [top('c', 'Top A', 1500)];

  test('a complete well raises no flag (negative control)', () => {
    expect(wellInventory(CLEAN, cleanLogs, cleanTops, { frame: 'EPSG:32631' }).flags).toEqual([]);
  });

  const cases = [
    ['no_location', { surface_x: null, surface_y: null }],
    ['no_crs', { crs: null }],
    ['mixed_frame', { crs: 'EPSG:2274' }],
    ['no_kb', { kb_m: 0 }],
    ['no_td', { td_md_m: null }],
    ['no_survey', { deviation: [] }],
    ['top_below_td', { td_md_m: 1400 }],
  ];
  for (const [code, patch] of cases) {
    test(`${code} is raised by the well that has it`, () => {
      expect(wellInventory({ ...CLEAN, ...patch }, cleanLogs, cleanTops, { frame: 'EPSG:32631' }).flags).toContain(code);
    });
  }
  test('log-derived flags: bottom-up, irregular, no depth, no logs, no tops', () => {
    const f = (logs, tops = cleanTops) => wellInventory(CLEAN, logs, tops, { frame: 'EPSG:32631' }).flags;
    expect(f([log('c', 'TDEP', { start_md_m: 2135.3, stop_md_m: 2133.6, step_m: null }), log('c', 'GR', { start_md_m: 2135.3, stop_md_m: 2133.6, step_m: null })]))
      .toEqual(['bottom_up']); // not also "irregular": the reorient fixes the step
    expect(f([log('c', 'DEPT', { step_m: null }), log('c', 'GR', { step_m: null })])).toEqual(['irregular_step']);
    expect(f([log('c', 'GR')])).toEqual(['no_depth']);
    expect(f([])).toEqual(['no_logs']);
    expect(f(cleanLogs, [])).toEqual(['no_tops']);
  });
  test('the majority frame ignores unlocated wells; every flag has a reason and a fix', () => {
    expect(majorityFrame([CLEAN, { ...CLEAN, id: 'b' }, { ...CLEAN, id: 'x', crs: 'EPSG:2274' }, { ...CLEAN, id: 'y', crs: 'EPSG:2274', surface_x: null }])).toBe('EPSG:32631');
    for (const flag of QC_FLAGS) {
      expect(flag.why.length).toBeGreaterThan(10);
      expect(flag.fix.length).toBeGreaterThan(3);
      expect(`${flag.label}${flag.why}${flag.fix}`).not.toMatch(/—/);
    }
  });
  test('the saved G1 release is flagged for its bottom-up curves and missing CRS; counts per flag', () => {
    const rows = savedRows('registry-g1-2026-07.json');
    const logs = Object.entries(rows.logs).flatMap(([w, ls]) => ls.map((l) => ({ ...l, well_id: w })));
    const tops = Object.entries(rows.tops).flatMap(([w, ts]) => ts.map((t) => ({ ...t, well_id: w })));
    const inv = registryInventory(rows.wells, logs, tops);
    const g1 = inv.rows.find((r) => r.name === 'LEGACY G1-7');
    expect(g1.flags).toEqual(expect.arrayContaining(['bottom_up', 'no_crs']));
    expect(g1.bottomUpLogs).toEqual(['TDEP', 'GR']);
    expect(inv.counts.bottom_up).toBe(1);
    const csv = inventoryCsv(inv.rows, 'ft').split('\n');
    expect(csv[0]).toContain('KB (ft)');
    expect(csv[1]).toContain('Curves stored bottom-up');
  });
});

describe('the Inventory view', () => {
  const noopCtx = () => new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 0 }) : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  beforeAll(() => {
    installDomShims();
    jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(noopCtx);
  });

  test('flags filter the table and a row opens the well', async () => {
    const g1 = savedRows('registry-g1-2026-07.json');
    const pt = savedRows('registry-pt-2026-09.json');
    mockBackend = makeInMemoryBackend({
      seedSharedWell: false,
      seedRows: { wells: [...g1.wells, ...pt.wells], tops: { ...g1.tops, ...pt.tops }, logs: { ...g1.logs, ...pt.logs } },
    });
    render(<MemoryRouter><WellDataManager /></MemoryRouter>);
    await screen.findAllByTestId('wdm-well-row');
    fireEvent.click(screen.getByTestId('wdm-view-inventory'));
    await screen.findByTestId('wdm-inventory-table');
    expect(screen.getAllByTestId('wdm-inventory-row')).toHaveLength(2);
    expect(screen.getByTestId('wdm-flag-bottom_up')).toHaveTextContent('Curves stored bottom-up: 1');
    fireEvent.click(screen.getByTestId('wdm-flag-bottom_up'));
    expect(screen.getAllByTestId('wdm-inventory-row').map((r) => r.dataset.wellName)).toEqual(['LEGACY G1-7']);
    fireEvent.click(screen.getByTestId('wdm-flag-bottom_up'));
    expect(screen.getAllByTestId('wdm-inventory-row')).toHaveLength(2);
    const row = screen.getAllByTestId('wdm-inventory-row').find((r) => r.dataset.wellName === 'GULF SP-2');
    expect(within(row).getByTestId('wdm-row-flag-no_logs')).toBeInTheDocument();
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByTestId('wdm-detail-name')).toHaveTextContent('GULF SP-2'));
  });
});
