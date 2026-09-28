/**
 * "Replace from paste" on the Tops, Deviation and Checkshots tabs settles.
 *
 * Before the fix WellDetail handed PasteReplacePanel a fresh `fields` array
 * literal every render; the panel's memo recomputed, its effect called
 * onParsed, onParsed set the editor state, and the page re-rendered without
 * end (jsdom hangs; the browser spins). These tests mount the real
 * workstation on the in-memory backend, open each paste editor, paste text,
 * and assert a bounded number of panel renders and onParsed calls, that the
 * column mapper previews the parsed rows, and that Save writes them.
 *
 * The panel itself is also checked against a caller that still passes a
 * fresh literal each render, so no other caller can re-trigger the loop.
 */
import fs from 'fs';
import path from 'path';
import React, { useState } from 'react';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import WellDataManager from '../WellDataManager';

// Count every PasteReplacePanel render and every onParsed it emits, per kind.
const mockCounts = {};
jest.mock('@/components/wells/PasteReplacePanel', () => {
  const R = jest.requireActual('react');
  const actual = jest.requireActual('@/components/wells/PasteReplacePanel');
  const Real = actual.default;
  function CountingPasteReplacePanel(props) {
    const c = (mockCounts[props.kind] = mockCounts[props.kind] || { renders: 0, parsed: 0, last: undefined });
    c.renders += 1;
    const onParsed = (s) => { c.parsed += 1; c.last = s; props.onParsed(s); };
    return R.createElement(Real, { ...props, onParsed });
  }
  return { ...actual, __esModule: true, default: CountingPasteReplacePanel };
});

let mockBackend = null;
jest.mock('../services/registryBackend', () => ({
  makeRegistryBackend: () => mockBackend,
}));
const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'wells');
const lasFile = (name) => ({
  name: `${name}.las`,
  text: async () => fs.readFileSync(path.join(DATA_DIR, 'las', `${name}.las`), 'utf8'),
});

let wellId = null;
async function seedBackend() {
  const b = makeInMemoryBackend();
  const { meta, prep } = await b.parseLasFile(lasFile('basic_20'));
  const well = await b.saveWell({
    name: 'KETA G1-1', uwi: 'KETA-G1-BASIC', surfaceX: 501000, surfaceY: 6700200, kbM: 31.2, tdMdM: meta.suggestedHeader.tdMdM,
    checkshots: [{ tvdss_m: 276.8, twt_ms: 240, md_m: 304.8 }, { tvdss_m: 581.6, twt_ms: 440, md_m: 609.6 }],
  });
  await b.saveLogs(well.id, prep.logs);
  await b.saveTop(well.id, { name: 'Top Dome', mdM: 1502.5 });
  wellId = well.id;
  return b;
}

const noopCtx = () => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 0 }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(noopCtx);
});
beforeEach(async () => {
  Object.keys(mockCounts).forEach((k) => delete mockCounts[k]);
  mockBackend = await seedBackend();
});

const ROUTE = '/dashboard/apps/geoscience/well-data-manager';

async function openPasteEditor(tab) {
  render(<MemoryRouter initialEntries={[ROUTE]}><WellDataManager /></MemoryRouter>);
  const rows = await screen.findAllByTestId('wdm-well-row');
  fireEvent.click(rows.find((r) => r.textContent.includes('KETA G1-1')));
  const detail = await screen.findByTestId('wdm-detail');
  fireEvent.click(within(detail).getByRole('button', { name: new RegExp(`^${tab}`) }));
  fireEvent.click(await screen.findByTestId(`wdm-edit-${tab.toLowerCase()}`));
  fireEvent.click(screen.getByTestId(`wdm-${tab.toLowerCase()}-paste-toggle`));
  return screen.findByTestId(`wdm-${tab.toLowerCase()}-paste-text`);
}

// Mount + open + a paste is a handful of renders; the loop ran unbounded.
const RENDER_BOUND = 25;
const PARSED_BOUND = 10;

async function pasteAndSettle(tab, kind, text) {
  const area = await openPasteEditor(tab);
  const before = { ...mockCounts[kind] };
  expect(before.renders).toBeLessThan(RENDER_BOUND);
  fireEvent.change(area, { target: { value: text } });
  await act(async () => { await new Promise((r) => { setTimeout(r, 50); }); });
  const settled = { ...mockCounts[kind] };
  await act(async () => { await new Promise((r) => { setTimeout(r, 50); }); });
  // settled: nothing further renders or emits once the paste is parsed
  expect(mockCounts[kind].renders).toBe(settled.renders);
  expect(mockCounts[kind].parsed).toBe(settled.parsed);
  expect(settled.renders).toBeLessThan(RENDER_BOUND);
  expect(settled.parsed).toBeLessThan(PARSED_BOUND);
  return mockCounts[kind].last;
}

describe('WDM replace-from-paste settles', () => {
  test('Tops: pasted rows reach the editor, preview and save', async () => {
    const last = await pasteAndSettle('Tops', 'tops', 'Name,MD\nTop A,1000\nTop B,1500.5');
    expect(last.parsed.rows).toEqual([['Top A', '1000'], ['Top B', '1500.5']]);
    expect(last.map).toMatchObject({ name: 0, md: 1 });
    expect(screen.getByText('Top A')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('wdm-tops-save'));
    await waitFor(async () => {
      const tops = await mockBackend.listTops(wellId);
      expect(tops.map((t) => [t.name, t.md_m])).toEqual([['Top A', 1000], ['Top B', 1500.5]]);
    });
  });

  test('Deviation: pasted stations reach the editor, preview and save', async () => {
    const last = await pasteAndSettle('Deviation', 'deviation', 'MD,Inc,Azi\n0,0,0\n500,5,45\n1000,10,90');
    expect(last.parsed.rows).toHaveLength(3);
    expect(last.map).toMatchObject({ md: 0, inc: 1, azi: 2 });
    fireEvent.click(screen.getByTestId('wdm-deviation-save'));
    await waitFor(async () => {
      const w = (await mockBackend.listWells()).find((x) => x.id === wellId);
      expect((w.deviation || []).map((s) => [s.md, s.inc, s.azi])).toEqual([[0, 0, 0], [500, 5, 45], [1000, 10, 90]]);
    });
  });

  test('Checkshots: pasted rows reach the editor, preview and save', async () => {
    const last = await pasteAndSettle('Checkshots', 'checkshots', 'TVDSS m,TWT ms\n300,250\n600,450\n900,640');
    expect(last.parsed.rows).toHaveLength(3);
    expect(last.map).toMatchObject({ depth: 0, time: 1 });
    fireEvent.click(screen.getByTestId('wdm-checkshots-save'));
    await waitFor(async () => {
      const w = (await mockBackend.listWells()).find((x) => x.id === wellId);
      expect((w.checkshots || []).map((c) => [c.tvdss_m, c.twt_ms])).toEqual([[300, 250], [600, 450], [900, 640]]);
    });
  });
});

describe('PasteReplacePanel is robust to a fresh fields literal', () => {
  test('a caller passing a new array each render and setting state in onParsed settles', async () => {
    const { default: PasteReplacePanel } = jest.requireMock('@/components/wells/PasteReplacePanel');
    let parentRenders = 0;
    function Caller() {
      parentRenders += 1;
      const [pasted, setPasted] = useState(null);
      return (
        <div>
          <PasteReplacePanel kind="tops" fields={['name', 'md']} labels={{ name: 'Top name', md: 'MD (m)' }}
            convention={{ mdUnit: 'm' }} onConvention={() => {}} onParsed={(s) => setPasted(s)} testIdPrefix="probe" />
          <span data-testid="probe-count">{pasted ? pasted.parsed.rows.length : 0}</span>
        </div>
      );
    }
    render(<Caller />);
    fireEvent.change(screen.getByTestId('probe-paste-text'), { target: { value: 'Name,MD\nA,1\nB,2' } });
    await act(async () => { await new Promise((r) => { setTimeout(r, 50); }); });
    expect(screen.getByTestId('probe-count')).toHaveTextContent('2');
    expect(parentRenders).toBeLessThan(RENDER_BOUND);
  });
});
