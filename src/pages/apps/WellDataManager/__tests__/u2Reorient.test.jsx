/**
 * WDM-U2-010 (finding WDM-U1-032): curves the G1 release (2026-07) stored
 * bottom-up. On read the quick view plots them against depth (negative
 * control: before, it fell back to sample index); the owner's Reorient
 * reverses them in place (same ids), fixes start, stop and step, and the
 * inventory flag clears. No schema change.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { bottomUpLogs, orientForDisplay, planReorient } from '../engine/reorient';
import { wellInventory } from '../engine/inventory';
import WellDataManager from '../WellDataManager';

jest.setTimeout(30000);

let mockBackend = null;
jest.mock('../services/registryBackend', () => ({ makeRegistryBackend: () => mockBackend }));
const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');

// live registry path: storage object first, then the row; a refused row
// update puts the original samples back
const mockCalls = [];
let mockRowResult = { data: [{ id: 'l1' }], error: null };
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    storage: { from: () => ({ update: async (p, blob) => { mockCalls.push(['object', p, blob.size]); return { error: null }; } }) },
    from: () => ({ update: (patch) => ({ eq: () => ({ select: async () => { mockCalls.push(['row', patch]); return mockRowResult; } }) }) }),
  },
}));
const { rewriteLogSamples } = jest.requireActual('@/lib/wellsRegistry');

const SAVED = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'wdm', 'saved');
const g1 = () => JSON.parse(fs.readFileSync(path.join(SAVED, 'registry-g1-2026-07.json'), 'utf8'));

describe('engine', () => {
  const rows = g1();
  const logs = rows.logs['g1-well-1'].map(({ samples, ...l }) => ({ ...l, well_id: 'g1-well-1' }));
  const data = new Map(rows.logs['g1-well-1'].map((l) => [l.id, Float32Array.from(l.samples)]));

  test('the G1 curves are detected; an ascending curve is left alone', () => {
    expect(bottomUpLogs(logs).map((l) => l.mnemonic)).toEqual(['TDEP', 'GR']);
    const asc = { ...logs[1], start_md_m: 1, stop_md_m: 2 };
    const o = orientForDisplay(asc, data.get('g1-log-2'));
    expect(o.reoriented).toBe(false);
    expect(o.data).toBe(data.get('g1-log-2'));
  });

  test('on read: ascending copy with a regular step from the reversed depth', () => {
    const o = orientForDisplay(logs[1], data.get('g1-log-2'), data.get('g1-log-1'));
    expect(o.log.start_md_m).toBe(2133.6);
    expect(o.log.stop_md_m).toBeCloseTo(2135.2764, 6);
    expect(o.log.step_m).toBeCloseTo(0.1524, 4);
    expect(Array.from(o.data).slice(0, 2)).toEqual([100, Math.fround(99.596)]);
    // the stored array is not mutated
    expect(data.get('g1-log-2')[0]).toBe(60);
  });

  test('repair plan: every bottom-up curve reversed, provenance says so', () => {
    const plan = planReorient(logs, data, { now: new Date('2026-09-28T12:00:00Z') });
    expect(plan.writes.map((w) => w.log.id)).toEqual(['g1-log-1', 'g1-log-2']);
    expect(plan.writes[0].data[0]).toBe(Math.fround(2133.6));
    expect(plan.writes[0].patch).toMatchObject({ start_md_m: 2133.6, step_m: expect.any(Number), provenance: { reversed_from_bottom_up: true, reoriented_at: '2026-09-28T12:00:00.000Z' } });
    expect(plan.stepM).toBeCloseTo(0.1524, 4);
    expect(() => planReorient(logs, new Map())).toThrow(/not loaded/);
  });
});

describe('the live registry rewrite (src/lib/wellsRegistry.js)', () => {
  const log = { id: 'l1', mnemonic: 'GR', n_samples: 3, storage_path: 'u/w/logs/l1.f32' };
  test('object then row; a refused row update restores the original samples', async () => {
    mockCalls.length = 0;
    await rewriteLogSamples(log, Float32Array.of(3, 2, 1), { start_md_m: 1 }, { original: Float32Array.of(1, 2, 3) });
    expect(mockCalls.map((c) => c[0])).toEqual(['object', 'row']);
    mockCalls.length = 0;
    mockRowResult = { data: [], error: null };
    await expect(rewriteLogSamples(log, Float32Array.of(3, 2, 1), {}, { original: Float32Array.of(1, 2, 3) })).rejects.toThrow(/Only the owner/);
    expect(mockCalls.map((c) => c[0])).toEqual(['object', 'row', 'object']);
    await expect(rewriteLogSamples(log, Float32Array.of(1), {})).rejects.toThrow(/1 samples, the row says 3/);
  });
});

describe('in the workstation', () => {
  beforeAll(() => {
    installDomShims();
    jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, { get: () => () => ({ width: 0 }), set: () => true }));
  });

  test('quick view on read, then Reorient in place; the inventory flag clears', async () => {
    mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: g1() });
    render(<MemoryRouter><WellDataManager /></MemoryRouter>);
    fireEvent.click((await screen.findAllByTestId('wdm-well-row'))[0]);
    const detail = await screen.findByTestId('wdm-detail');
    fireEvent.click(within(detail).getByRole('button', { name: /^Logs/ }));
    expect(await screen.findByTestId('wdm-bottom-up-note')).toHaveTextContent('2 curves were stored bottom-up by an earlier release (TDEP, GR).');
    fireEvent.click(screen.getByTestId('wdm-plot-GR'));
    const canvas = screen.getByTestId('wdm-log-tracks');
    await waitFor(() => expect(canvas.dataset.depthAxis).toBe('md'));
    expect(Number(canvas.dataset.depthTop)).toBe(2133.6);

    const idsBefore = (await mockBackend.listLogs('g1-well-1')).map((l) => l.id);
    fireEvent.click(screen.getByTestId('wdm-reorient'));
    await waitFor(() => expect(screen.getByTestId('wdm-status-message')).toHaveTextContent('Reoriented 2 curves: depth now increases, 2133.60 to 2135.28 m, step 0.1524 m.'));
    const after = await mockBackend.listLogs('g1-well-1');
    expect(after.map((l) => l.id)).toEqual(idsBefore);
    expect(after.every((l) => l.start_md_m < l.stop_md_m && l.step_m > 0.15)).toBe(true);
    expect(Array.from(await mockBackend.downloadCurve(after[1])).slice(-1)).toEqual([60]);
    await waitFor(() => expect(screen.queryByTestId('wdm-bottom-up-note')).toBeNull());
    const w = (await mockBackend.listWells())[0];
    expect(wellInventory(w, after, []).flags).not.toContain('bottom_up');
  });

  test('a read-only org well shows the note without the button', async () => {
    const rows = g1();
    rows.wells[0] = { ...rows.wells[0], user_id: 'user-other', organization_id: 'org-dev', is_own: false };
    mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: rows });
    render(<MemoryRouter><WellDataManager /></MemoryRouter>);
    fireEvent.click((await screen.findAllByTestId('wdm-well-row'))[0]);
    const detail = await screen.findByTestId('wdm-detail');
    fireEvent.click(within(detail).getByRole('button', { name: /^Logs/ }));
    expect(await screen.findByTestId('wdm-bottom-up-note')).toHaveTextContent('Only the owner can reorient them.');
    expect(screen.queryByTestId('wdm-reorient')).toBeNull();
  });
});
