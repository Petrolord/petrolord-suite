/**
 * WDM-U2-013: (1) every row the shared registry writes carries app_build
 * (negative control: the payloads had none), with one retry without the
 * stamp where the column is missing; (2) curve uploads report progress and
 * can be stopped after the current curve, keeping what was saved and
 * saying so.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { PLATFORM_BUILD } from '@/lib/platformBuild';
import WellDataManager from '../WellDataManager';

jest.setTimeout(30000);

const mockWrites = [];
let mockMissingColumn = false;
jest.mock('@/lib/customSupabaseClient', () => {
  const builder = (table) => {
    const st = { op: 'select', payload: null };
    const result = () => {
      if (st.op === 'select') return { data: [], error: null };
      const rows = [].concat(st.payload);
      if (mockMissingColumn && rows.some((r) => 'app_build' in r)) {
        return { data: null, error: { code: 'PGRST204', message: `Could not find the 'app_build' column of '${table}' in the schema cache` } };
      }
      mockWrites.push({ table, op: st.op, payload: st.payload });
      const out = rows.map((r, i) => ({ id: r.id || `${table}-${mockWrites.length}-${i}`, ...r }));
      return { data: st.single ? out[0] : out, error: null };
    };
    const b = {
      select() { return b; },
      insert(p) { st.op = 'insert'; st.payload = p; return b; },
      update(p) { st.op = 'update'; st.payload = p; return b; },
      delete() { st.op = 'select'; return b; },
      eq() { return b; },
      order() { return b; },
      single() { st.single = true; return Promise.resolve(result()); },
      then(f, r) { return Promise.resolve(result()).then(f, r); },
    };
    return b;
  };
  return {
    supabase: {
      from: (t) => builder(t),
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
      storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({}) }) },
    },
  };
});

const reg = jest.requireActual('@/lib/wellsRegistry');
let mockBackend = null;
jest.mock('../services/registryBackend', () => ({ makeRegistryBackend: () => mockBackend }));
const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');

const log = (m) => ({ mnemonic: m, data: Float32Array.of(1, 2, 3), startMdM: 1, stopMdM: 3, stepM: 1, nSamples: 3, nullCount: 0, provenance: {} });

let uuid = 0;
beforeAll(() => { if (!globalThis.crypto?.randomUUID) Object.defineProperty(globalThis, 'crypto', { value: { ...(globalThis.crypto || {}), randomUUID: () => `uuid-${++uuid}` }, configurable: true }); });
beforeEach(() => { mockWrites.length = 0; mockMissingColumn = false; reg._resetBuildStamp(); });

describe('app_build on every registry write (src/lib/wellsRegistry.js)', () => {
  test('well, tops, logs, zones, updates', async () => {
    await reg.saveWell({ name: 'W', surfaceX: 1, surfaceY: 2 });
    await reg.saveTop('w1', { name: 'T', mdM: 10 });
    await reg.replaceTops('w1', [{ name: 'A', md: 1 }, { name: 'B', md: 2 }]);
    await reg.updateTop('t1', { mdM: 11 });
    await reg.updateWell('w1', { status: 'oil' });
    await reg.updateWellData('w1', { kbM: 25 });
    await reg.saveLogs('w1', [log('GR')]);
    await reg.saveZone('w1', { name: 'Z', topMdM: 1, baseMdM: 2 });
    await reg.updateZone('z1', { properties: {} });
    await reg.propagateTop('T2', [{ wellId: 'w2', mdM: 5 }]);
    const written = mockWrites.flatMap((w) => [].concat(w.payload).map((p) => [w.table, w.op, p.app_build]));
    expect(written.length).toBeGreaterThanOrEqual(11);
    for (const [table, op, build] of written) expect([table, op, build]).toEqual([table, op, PLATFORM_BUILD.sha]);
  });

  test('where the column is missing the write is retried once without it and the session stops stamping', async () => {
    mockMissingColumn = true;
    const w = await reg.saveWell({ name: 'W', surfaceX: 1, surfaceY: 2 });
    expect(w.name).toBe('W');
    expect(mockWrites[0].payload.app_build).toBeUndefined();
    await reg.saveTop('w1', { name: 'T', mdM: 10 });
    expect(mockWrites[1].payload.app_build).toBeUndefined();
  });
});

describe('upload progress and stop', () => {
  test('saveLogs reports each curve and stops after the current one, keeping what was saved', async () => {
    const seen = [];
    const out = await reg.saveLogs('w1', [log('A'), log('B')], { onProgress: (p) => seen.push(`${p.done}/${p.total}:${p.mnemonic}`) });
    expect(out).toHaveLength(2);
    expect(seen).toEqual(['0/2:A', '1/2:B', '2/2:null']);
    const cancel = { cancelled: false };
    const err = await reg.saveLogs('w1', [log('A'), log('B'), log('C')], { onProgress: ({ done }) => { if (done === 1) cancel.cancelled = true; }, cancel })
      .catch((e) => e);
    // the curve in flight when Stop was pressed completes; nothing after it starts
    expect(err.name).toBe('LogsStoppedError');
    expect(err.saved.map((l) => l.mnemonic)).toEqual(['A', 'B']);
    expect(err.message).toBe('Import stopped after 2 of 3 curves. The 2 saved stay on the well; delete them on the Logs tab if you do not want them.');
  });

  test('the LAS dialog shows the progress and a stop that keeps the saved curves', async () => {
    installDomShims();
    jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, { get: () => () => ({ width: 0 }), set: () => true }));
    mockBackend = makeInMemoryBackend({ seedSharedWell: false, saveDelayMs: 40 });
    render(<MemoryRouter><WellDataManager /></MemoryRouter>);
    await screen.findByTestId('wdm-tree');
    fireEvent.click(screen.getByTestId('wdm-open-las'));
    const las = ['~Version', 'VERS. 2.0 :', 'WRAP. NO :', '~Well', 'STRT.M 1 :', 'STOP.M 2 :', 'STEP.M 0.5 :', 'NULL. -999.25 :', 'WELL. STOP-1 :',
      '~Curve', 'DEPT.M :', 'GR.GAPI :', 'RHOB.G/C3 :', 'NPHI.V/V :', '~A', '1 50 2.3 0.2', '1.5 60 2.4 0.25', '2 70 2.5 0.3', ''].join('\n');
    fireEvent.change(await screen.findByTestId('wdm-las-file'), { target: { files: [{ name: 'stop.las', text: async () => las }] } });
    fireEvent.change(await screen.findByTestId('wdm-las-x'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('wdm-las-y'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('wdm-las-import'));
    expect(await screen.findByTestId('wdm-las-progress')).toHaveTextContent(/Saving curve \d of 4/);
    fireEvent.click(screen.getByTestId('wdm-las-stop'));
    await waitFor(() => expect(screen.getByTestId('wdm-status-message')).toHaveTextContent(/Import stopped after [12] of 4 curves/));
    const w = (await mockBackend.listWells()).find((x) => x.name === 'STOP-1');
    const saved = await mockBackend.listLogs(w.id);
    expect(saved.length).toBeGreaterThanOrEqual(1);
    expect(saved.length).toBeLessThan(4);
    expect(saved[0].app_build).toBe(PLATFORM_BUILD.sha);
  });
});
