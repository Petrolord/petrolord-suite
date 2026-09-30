/**
 * WDM-U2-016: (1) undo of the last tops save (finding WDM-U1-028: a grid
 * save deleted removed rows and a paste replaced every top, with no way
 * back); (2) the checkshot "Z is an elevation" toggle for Petrel exports
 * with negative-down Z (finding WDM-U1-013 asked for it), at the shared
 * paste layer so Add well and Seismolord's import gain it too.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { planRestore } from '../engine/topsUndo';
import { buildCheckshotInputs, parseDelimited, guessMapping } from '@/lib/wellImport';
import WellDataManager from '../WellDataManager';

jest.setTimeout(30000);
let mockBackend = null;
jest.mock('../services/registryBackend', () => ({ makeRegistryBackend: () => mockBackend }));
const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');

const SAVED = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'wdm', 'saved');
const HOSTILE = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'wdm', 'hostile');
const savedRows = (f) => JSON.parse(fs.readFileSync(path.join(SAVED, f), 'utf8'));

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, { get: () => () => ({ width: 0 }), set: () => true }));
});

describe('tops undo', () => {
  test('planRestore: changed back by id, added removed, deleted re-created', () => {
    const snap = [{ id: 'a', name: 'A', md_m: 100, confidence: 'high' }, { id: 'b', name: 'B', md_m: 200 }, { id: 'c', name: 'C', md_m: 300 }];
    const now = [{ id: 'a', name: 'A2', md_m: 101, confidence: 'high' }, { id: 'c', name: 'C', md_m: 300 }, { id: 'd', name: 'D', md_m: 400 }];
    const p = planRestore(now, snap);
    expect(p.updates).toEqual([{ id: 'a', patch: { name: 'A', mdM: 100 } }]);
    expect(p.deletes.map((t) => t.id)).toEqual(['d']);
    expect(p.creates.map((t) => t.id)).toEqual(['b']);
    expect(p.unchanged).toBe(1);
  });

  test('a grid save that moved one top and removed another is undone in the workstation', async () => {
    mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: savedRows('registry-g1-2026-07.json') });
    render(<MemoryRouter><WellDataManager /></MemoryRouter>);
    fireEvent.click((await screen.findAllByTestId('wdm-well-row'))[0]);
    const detail = await screen.findByTestId('wdm-detail');
    fireEvent.click(within(detail).getByRole('button', { name: /^Tops/ }));
    await screen.findByTestId('wdm-tops-table');
    expect(screen.queryByTestId('wdm-tops-undo')).toBeNull();
    fireEvent.click(screen.getByTestId('wdm-edit-tops'));
    fireEvent.change(screen.getByTestId('wdm-tops-cell-0-md'), { target: { value: '2130' } });
    fireEvent.click(screen.getByTestId('wdm-tops-del-1'));
    fireEvent.click(screen.getByTestId('wdm-tops-save'));
    await waitFor(() => expect(screen.getByTestId('wdm-status-message')).toHaveTextContent('Tops saved (1 changed, 1 removed).'));
    expect((await mockBackend.listTops('g1-well-1')).map((t) => [t.name, t.md_m])).toEqual([['Top Reservoir', 2130]]);
    fireEvent.click(await screen.findByTestId('wdm-tops-undo'));
    await waitFor(() => expect(screen.getByTestId('wdm-status-message')).toHaveTextContent(
      'Tops restored to before the last grid save (1 changed back, 0 removed, 1 re-created with new ids, so Well Correlation sees them as new picks).',
    ));
    const back = await mockBackend.listTops('g1-well-1');
    expect(back.map((t) => [t.name, t.md_m, t.interpreter])).toEqual([['Top Reservoir', 2134.5, 'ama'], ['Base Reservoir', 2135, null]]);
    expect(back[0].id).toBe('g1-top-1'); // the kept top keeps its id
    await waitFor(() => expect(screen.queryByTestId('wdm-tops-undo')).toBeNull());
  });
});

describe('checkshot elevation toggle (shared paste layer)', () => {
  const text = fs.readFileSync(path.join(HOSTILE, 'checkshots_petrel_negative_z.txt'), 'utf8');
  const p = parseDelimited(text);
  const map = guessMapping(p.header, ['depth', 'time']);

  test('ticked, negative-down Z reads as TVDSS; unticked, the message names the toggle', () => {
    expect(() => buildCheckshotInputs(p.rows, map)).toThrow(/Tick "Z is an elevation" above/);
    const rows = buildCheckshotInputs(p.rows, map, { elevation: true });
    expect(rows.every((r) => r.depth >= 0)).toBe(true);
    expect(rows[1].depth).toBe(-Number(p.rows[1][map.depth]));
    expect(() => buildCheckshotInputs([['100', '50'], ['200', '100']], { depth: 0, time: 1 }, { elevation: true })).toThrow(/read as depths already/);
  });

  test('Replace from paste with the toggle stores the table as TVDSS and records it', async () => {
    const rows = savedRows('registry-pt-2026-09.json');
    mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: rows });
    render(<MemoryRouter><WellDataManager /></MemoryRouter>);
    fireEvent.click((await screen.findAllByTestId('wdm-well-row'))[0]);
    const detail = await screen.findByTestId('wdm-detail');
    fireEvent.click(within(detail).getByRole('button', { name: /^Checkshots/ }));
    fireEvent.click(await screen.findByTestId('wdm-edit-checkshots'));
    fireEvent.click(screen.getByTestId('wdm-checkshots-paste-toggle'));
    fireEvent.change(await screen.findByTestId('wdm-checkshots-paste-text'), { target: { value: text } });
    fireEvent.click(screen.getByTestId('wdm-checkshots-cs-elevation'));
    expect(screen.getByTestId('wdm-checkshots-cs-depthref')).toHaveValue('tvdss');
    expect(screen.getByTestId('wdm-checkshots-cs-depthref')).toBeDisabled();
    fireEvent.click(screen.getByTestId('wdm-checkshots-save'));
    await waitFor(() => expect(screen.getByTestId('wdm-status-message')).toHaveTextContent(/Checkshots saved \(\d+ rows, entered as TVDSS/));
    const w = (await mockBackend.listWells())[0];
    expect(w.checkshots_provenance).toMatchObject({ z_elevation: true, units_in: { depth_ref: 'tvdss' } });
    expect(w.checkshots[1].tvdss_m).toBeCloseTo(-Number(p.rows[1][map.depth]) * (w.checkshots_provenance.units_in.depth_unit === 'ft' ? 0.3048 : 1), 6);
  });
});
