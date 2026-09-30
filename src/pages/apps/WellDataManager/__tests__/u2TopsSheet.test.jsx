/**
 * WDM-U2-005: the cross-well tops sheet. Planning is pure and tested with
 * hostile pastes (unknown well, read-only well, duplicate line, bad MD,
 * UWI match, feet header); the view edits, renames across wells and
 * applies a paste through updateTop / saveTop, keeping top ids.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { sheetRows, topNameSummary, planBulkRename, planTopsPaste } from '../engine/topsSheet';
import { pasteMapping } from '../components/TopsSheetView';
import { parseDelimited } from '@/lib/wellImport';
import WellDataManager from '../WellDataManager';

jest.setTimeout(30000);

let mockBackend = null;
jest.mock('../services/registryBackend', () => ({ makeRegistryBackend: () => mockBackend }));
const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');

const W = (id, name, over = {}) => ({
  id, name, uwi: null, user_id: 'user-dev', is_own: true, organization_id: null, kb_m: 25, td_md_m: 3000,
  surface_x: 500000, surface_y: 6700000, crs: 'EPSG:32631', deviation: [], checkshots: [],
  created_at: `2026-09-0${id.slice(-1)}T00:00:00.000Z`, ...over,
});
const SEED = {
  wells: [W('w1', 'ALPHA-1', { uwi: 'NG-001' }), W('w2', 'BRAVO-2'), W('w3', 'CHARLIE-3', { user_id: 'user-other', is_own: false, organization_id: 'org-dev' })],
  tops: {
    w1: [{ id: 't11', name: 'Top Sand', md_m: 1500 }, { id: 't12', name: 'Base Sand', md_m: 1620.5 }],
    w2: [{ id: 't21', name: 'top sand', md_m: 1510 }],
    w3: [{ id: 't31', name: 'Top Sand', md_m: 1490 }],
  },
  logs: {},
};
const flatTops = () => Object.entries(SEED.tops).flatMap(([w, ts]) => ts.map((t) => ({ ...t, well_id: w })));

describe('planning (engine)', () => {
  const rows = sheetRows(SEED.wells, flatTops());

  test('rows carry MD, TVD and TVDSS; the summary counts wells per name, case-insensitively', () => {
    expect(rows.map((r) => `${r.wellName}:${r.name}`)).toEqual(['ALPHA-1:Top Sand', 'ALPHA-1:Base Sand', 'BRAVO-2:top sand', 'CHARLIE-3:Top Sand']);
    expect(rows[0].tvdss).toBe(1475);
    const s = topNameSummary(rows, SEED.wells);
    expect(s[0]).toMatchObject({ name: 'Top Sand', count: 3, total: 3, missing: [] });
    expect(s[1]).toMatchObject({ name: 'Base Sand', count: 1, missing: ['BRAVO-2', 'CHARLIE-3'] });
  });

  test('bulk rename: own wells only, and never onto a name the well already has', () => {
    const p = planBulkRename(rows, 'top sand', 'TOP_SAND');
    expect(p.updates).toEqual([{ topId: 't11', name: 'TOP_SAND' }, { topId: 't21', name: 'TOP_SAND' }]);
    expect(p.readOnly).toEqual(['CHARLIE-3']);
    const clash = planBulkRename(rows, 'Top Sand', 'Base Sand');
    expect(clash.conflicts).toEqual(['ALPHA-1']);
    expect(clash.updates.map((u) => u.topId)).toEqual(['t21']);
    expect(() => planBulkRename(rows, 'Top Sand', '  ')).toThrow(/new name/);
  });

  test('a hostile paste: every line not used says why; UWI and spacing variants match; feet convert', () => {
    const text = [
      'Well\tSurface\tMD (ft)',
      'NG-001\tTop Sand\t4921.26',   // UWI match, moves t11
      'bravo  2\tTop Sand\t1',        // no such well (spacing is not a dash)
      'BRAVO-2\tNew Marker\t5000',    // created
      'CHARLIE-3\tTop Sand\t4000',    // read-only
      'ALPHA-1\tBase Sand\tabc',      // bad MD
      'alpha-1\tTop Sand\t4900',      // duplicate of line 1
      'ALPHA-1\tBase Sand\t5316.6',   // unchanged? 1620.5 m = 5316.6 ft rounded, so a move
      '',
    ].join('\n');
    const p = parseDelimited(text);
    const map = pasteMapping(p.header);
    expect(map).toEqual({ well: 0, name: 1, md: 2 });
    const plan = planTopsPaste(p.rows, map, SEED.wells, rows, { mdUnit: 'ft' });
    expect(plan.creates).toEqual([{ wellId: 'w2', wellName: 'BRAVO-2', name: 'New Marker', mdM: 1524 }]);
    expect(plan.updates.map((u) => u.topId)).toEqual(['t11', 't12']);
    expect(plan.updates[0].mdM).toBeCloseTo(1500.000048, 6);
    expect(plan.problems.map((x) => x.line)).toEqual([2, 4, 5, 6]);
    expect(plan.problems[0].reason).toMatch(/no well named or with UWI "bravo  2"/);
    expect(plan.problems[1].reason).toMatch(/read-only/);
    expect(plan.problems[2].reason).toMatch(/MD "abc" is not a number/);
    expect(plan.problems[3].reason).toMatch(/also appears on line 1/);
  });
});

describe('the Tops sheet view', () => {
  const noopCtx = () => new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 0 }) : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  beforeAll(() => {
    installDomShims();
    jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(noopCtx);
  });

  async function openSheet() {
    mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: JSON.parse(JSON.stringify(SEED)) });
    render(<MemoryRouter><WellDataManager /></MemoryRouter>);
    await screen.findAllByTestId('wdm-well-row');
    fireEvent.click(screen.getByTestId('wdm-view-tops'));
    return screen.findByTestId('wdm-sheet-table');
  }

  test('an MD edit saves through updateTop and keeps the top id; untouched rows are not written', async () => {
    await openSheet();
    const spy = jest.spyOn(mockBackend, 'updateTop');
    fireEvent.change(screen.getByTestId('wdm-sheet-md-ALPHA-1-Top Sand'), { target: { value: '1501.25' } });
    expect(screen.getByTestId('wdm-sheet-save')).toHaveTextContent('Save 1 change');
    fireEvent.click(screen.getByTestId('wdm-sheet-save'));
    await waitFor(() => expect(screen.getByTestId('wdm-status-message')).toHaveTextContent('Tops sheet saved (1 top changed).'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('t11', { name: 'Top Sand', mdM: 1501.25 });
    expect((await mockBackend.listTops('w1')).find((t) => t.id === 't11').md_m).toBe(1501.25);
    // read-only well: no inputs
    const ro = screen.getAllByTestId('wdm-sheet-row').find((r) => r.dataset.well === 'CHARLIE-3');
    expect(within(ro).queryByRole('textbox')).toBeNull();
  });

  test('rename across wells and paste from Excel', async () => {
    await openSheet();
    fireEvent.change(screen.getByTestId('wdm-sheet-rename-from'), { target: { value: 'Top Sand' } });
    fireEvent.change(screen.getByTestId('wdm-sheet-rename-to'), { target: { value: 'TOP_SAND' } });
    fireEvent.click(screen.getByTestId('wdm-sheet-rename-go'));
    await waitFor(() => expect(screen.getByTestId('wdm-status-message')).toHaveTextContent('Renamed 2 tops to "TOP_SAND" (1 on read-only wells left as they are).'));
    expect((await mockBackend.listTops('w2'))[0]).toMatchObject({ id: 't21', name: 'TOP_SAND' });

    fireEvent.click(screen.getByTestId('wdm-sheet-paste-toggle'));
    fireEvent.change(screen.getByTestId('wdm-sheet-paste-text'), { target: { value: 'Well,Top,MD (m)\nBRAVO-2,Base Sand,1633\nNOPE-9,Top Sand,1' } });
    const plan = await screen.findByTestId('wdm-sheet-paste-plan');
    expect(plan).toHaveTextContent('1 to add, 0 to move, 0 unchanged (MD read in m).');
    expect(plan).toHaveTextContent('Line 2: no well named or with UWI "NOPE-9".');
    fireEvent.click(screen.getByTestId('wdm-sheet-paste-apply'));
    await waitFor(() => expect(screen.getByTestId('wdm-status-message')).toHaveTextContent('Pasted tops: 1 added, 0 moved, 0 unchanged, 1 line not used.'));
    expect((await mockBackend.listTops('w2')).map((t) => t.name)).toEqual(['TOP_SAND', 'Base Sand']);
    expect(screen.getByTestId('wdm-sheet-name-Base Sand')).toHaveTextContent('Base Sand: 2 of 3');
  });
});
