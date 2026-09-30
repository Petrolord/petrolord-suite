/**
 * AppUpgrade Step 1 for Stratigraphy Studio (docs/upgrade/StratigraphyStudio-UPGRADE.md).
 * The practitioner-lens findings that the workstation, its views and the
 * shared section kit can show in jsdom. Every block failed on origin/main
 * (4300f020a) before its fix (negative controls recorded per test).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SectionView from '../components/SectionView';
import TopsTyping from '../components/TopsTyping';
import WheelerChart from '@/components/wells/section/WheelerChart';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { sequenceTracts } from '@/lib/stratigraphy/sequenceTracts';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

// the section canvas: a recording 2D context (jsdom draws nothing)
const calls = [];
const recordingCtx = () => {
  const state = {};
  return new Proxy(state, {
    get: (t, k) => {
      if (k in t) return t[k];
      if (k === 'measureText') return () => ({ width: 0 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return (...args) => { calls.push({ op: k, args, fillStyle: t.fillStyle }); };
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
};
beforeAll(() => {
  global.ResizeObserver = global.ResizeObserver || class { observe() {} disconnect() {} };
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(recordingCtx);
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 1000; } });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 600; } });
});
afterAll(() => {
  delete window.HTMLElement.prototype.clientWidth;
  delete window.HTMLElement.prototype.clientHeight;
});

const renderSection = (backend, props = {}) => render(
  <MemoryRouter><SectionView backend={backend} mode="section" scheme="catuneanu" onStatus={props.onStatus || (() => {})} saved={props.saved || null} onSaveProject={props.onSaveProject} /></MemoryRouter>,
);

describe('STRAT-U1-001 tracts pair sequence surfaces, whatever formation tops sit between them', () => {
  // KETA-1: Top Marker BSFR 1440, Top Dome formation top 1500, Mid Shale MFS 1580, Base Sand SU 1660.
  // MFS below BSFR bounds the highstand; the formation top between them must not break the pair.
  test('the engine wrapper finds the HST across the formation top (origin/main: none)', async () => {
    const backend = makeInMemoryBackend();
    const tops = await backend.listTops('corr-w1');
    const rows = sequenceTracts(tops);
    expect(rows.map((r) => [r.code, r.top_md_m, r.base_md_m])).toEqual([['HST', 1440, 1580]]);
  });

  test('the section fills the HST on KETA-1 and KETA-2 (origin/main: no tract drawn)', async () => {
    const backend = makeInMemoryBackend();
    renderSection(backend);
    await waitFor(() => expect(screen.getByTestId('strat-section-summary').textContent).toContain('2 tract'));
  });

  test('the Tops view names the tract below Top Marker (origin/main: blank)', async () => {
    const backend = makeInMemoryBackend();
    const well = (await backend.listWells()).find((w) => w.id === 'corr-w1');
    render(<TopsTyping well={well} tops={await backend.listTops('corr-w1')} units={[]} scheme="catuneanu" onSaveTop={jest.fn()} onStatus={jest.fn()} />);
    expect(screen.getByTestId('strat-top-tract-Top Marker').textContent).toBe('HST');
    expect(screen.getByTestId('strat-top-tract-Top Dome').textContent).toBe('');
  });

  test('a dated formation top splits the Wheeler cells without losing the tract (origin/main: both cells unnamed)', async () => {
    const backend = makeInMemoryBackend();
    const tops = (await backend.listTops('corr-w1')).map((t) => (t.name === 'Top Dome' ? { ...t, age_ma: 4.5 } : t));
    const wells = [{ id: 'corr-w1', name: 'KETA-1', surfaces: tops }];
    render(<WheelerChart wells={wells} tractRows={{ 'corr-w1': sequenceTracts(tops) }} testIdPrefix="wh" />);
    expect(screen.getByTestId('wh-cell-KETA-1-0').getAttribute('data-tract')).toBe('HST');
    expect(screen.getByTestId('wh-cell-KETA-1-1').getAttribute('data-tract')).toBe('HST');
  });
});

describe('STRAT-U1-002 Record tracts never erases a well it has nothing to write for', () => {
  test('a well with recorded tracts and no implied tract keeps them and is named (origin/main: replaced by nothing)', async () => {
    const backend = makeInMemoryBackend();
    // KETA-1's hand-recorded tract, then its Top Marker retyped so nothing is implied any more
    await backend.replaceIntervals('corr-w1', 'systems_tract', [{ top_md_m: 1440, base_md_m: 1580, code: 'HST', properties: { certain: true } }]);
    const tm = (await backend.listTops('corr-w1')).find((t) => t.name === 'Top Marker');
    await backend.updateTop(tm.id, { surface_type: 'formation_top' });
    const onStatus = jest.fn();
    renderSection(backend, { onStatus });
    await waitFor(() => expect(screen.getByTestId('strat-section-summary').textContent).toContain('3 wells'));
    fireEvent.click(screen.getByTestId('strat-record-tracts'));
    await waitFor(() => expect(onStatus).toHaveBeenCalledWith(expect.stringMatching(/^Recorded/)));
    const kept = (await backend.listIntervals('corr-w1')).filter((r) => r.kind === 'systems_tract');
    expect(kept).toHaveLength(1);
    expect(onStatus.mock.calls.map((c) => c[0]).join(' ')).toMatch(/KETA-1 kept its 1 recorded tract/);
  });
});

describe('STRAT-U1-004/005 the interval paste door (shared with Well Data Manager)', () => {
  // eslint-disable-next-line global-require
  const fs = require('fs'); const path = require('path');
  // eslint-disable-next-line global-require
  const IntervalsEditor = require('@/components/wells/IntervalsEditor').default;
  const FIX = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'strat', 'hostile');
  const paste = async (file) => {
    const onReplace = jest.fn(async () => {});
    const onStatus = jest.fn();
    render(<IntervalsEditor well={{ id: 'w', name: 'KETA-1', is_own: true }} intervals={[]} onReplace={onReplace} onStatus={onStatus} testIdPrefix="t" />);
    fireEvent.click(screen.getByTestId('t-paste-toggle'));
    fireEvent.change(screen.getByTestId('t-paste-paste-text'), { target: { value: fs.readFileSync(path.join(FIX, file), 'utf8') } });
    await waitFor(() => expect(screen.getByTestId('t-save').disabled).toBe(false));
    fireEvent.click(screen.getByTestId('t-save'));
    return { onReplace, onStatus };
  };

  test('"Top (ft)" flips the unit and the rows are stored in metres (origin/main: feet stored as metres)', async () => {
    const { onReplace } = await paste('intervals_feet_header.tsv');
    expect(screen.getByTestId('t-paste-mdunit').value).toBe('ft');
    await waitFor(() => expect(onReplace).toHaveBeenCalled());
    expect(onReplace.mock.calls[0][1][0].top_md_m).toBeCloseTo(4724.4 * 0.3048, 6);
  });

  test('a TVDSS file is refused with the reason and nothing is written (origin/main: stored as MD)', async () => {
    const { onReplace, onStatus } = await paste('intervals_petrel_tvdss.csv');
    await waitFor(() => expect(onStatus).toHaveBeenCalledWith(expect.stringMatching(/"Top TVDSS \(m\)" is a TVDSS depth/)));
    expect(onReplace).not.toHaveBeenCalled();
  });
});
