/**
 * WDM-U2-017 (finding WDM-U1-031): LAS 3.0 text and date-time channels are
 * imported. Validation against the fixture's own closed-form rows: the
 * lithology column comes back as codes 1..3 with the code table, the
 * acquisition time as whole minutes in seconds, aligned with depth (also
 * for a file logged bottom-up). Free text over the code limit is named and
 * not stored. Coded values are offered only on the file's own depth grid.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { parseLas } from '../engine/lasParse';
import { prepareLasForRegistry } from '../engine/lasIndex';
import { extractTextChannels, prepareTextChannels, MAX_CODES } from '../engine/lasTextChannels';
import WellDataManager from '../WellDataManager';

jest.setTimeout(30000);
let mockBackend = null;
jest.mock('../services/registryBackend', () => ({ makeRegistryBackend: () => mockBackend }));
const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');

const FILE = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'wdm', 'hostile', 'las30_tops_strings.las');
const TEXT = fs.readFileSync(FILE, 'utf8');
const door = (text, name = 'f.las') => {
  const parsed = parseLas(text);
  const { prep } = prepareLasForRegistry(parsed, { sourceFile: name });
  return { parsed, prep, text3: prepareTextChannels(text, parsed, prep, { sourceFile: name }) };
};

describe('engine', () => {
  test('the skipped columns are read back from the same rows', () => {
    const parsed = parseLas(TEXT);
    expect(parsed.skippedCurves.map((c) => c.mnemonic)).toEqual(['LITH', 'TIME']);
    const ch = extractTextChannels(TEXT, parsed);
    expect(ch[0].values.slice(0, 4)).toEqual(['SH 0', 'SH 1', 'SH 2', 'SH 0']);
    expect(ch[1].values[0]).toBe('2019-03-12T10:10:00');
  });

  test('text as codes, time as seconds after the first stamp (UTC assumed and said)', () => {
    const { prep, text3 } = door(TEXT);
    const [lith, time] = text3.logs;
    expect(lith.provenance).toMatchObject({ text_channel: 'string', codes: { 1: 'SH 0', 2: 'SH 1', 3: 'SH 2' } });
    expect(Array.from(lith.data)).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3, 1]);
    expect(time.unit).toBe('s');
    expect(time.provenance).toMatchObject({ text_channel: 'datetime', time_origin: '2019-03-12T10:10:00.000Z', zone_assumed_utc: true });
    expect(Array.from(time.data)).toEqual([0, 60, 120, 180, 240, 300, 360, 420, 480, 540]);
    expect(lith.startMdM).toBe(prep.startMdM);
    expect(lith.nSamples).toBe(prep.logs[0].data.length);
  });

  test('a bottom-up file: codes stay with their depths after the door reverses the curves', () => {
    const lines = TEXT.split('\n');
    const a = lines.findIndex((l) => l.startsWith('~Log_Data'));
    const b = lines.findIndex((l) => l.startsWith('~Tops_Parameter'));
    const rows = lines.slice(a + 1, b).filter((l) => l.trim());
    const up = [...lines.slice(0, a + 1), ...rows.reverse(), ...lines.slice(b)].join('\n')
      .replace('STRT.M  1500.00', 'STRT.M  1504.50').replace('STOP.M  1504.50', 'STOP.M  1500.00').replace('STEP.M  0.5', 'STEP.M  -0.5');
    const { prep, text3 } = door(up);
    expect(prep.startMdM).toBe(1500);
    expect(Array.from(text3.logs[0].data)).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3, 1].map((_, i) => [1, 2, 3][i % 3]));
    // at 1500 m the file says SH 0 whatever the order: code 1 means SH 0 in both
    expect(text3.logs[0].provenance.codes[text3.logs[0].data[0]]).toBe('SH 0');
    expect(text3.logs[1].data[0]).toBe(0);
  });

  test(`more than ${MAX_CODES} distinct values is free text: named, not stored`, () => {
    const head = TEXT.slice(0, TEXT.indexOf('~Log_Data'));
    const n = MAX_CODES + 5;
    const body = Array.from({ length: n }, (_, i) => `${(1500 + i * 0.5).toFixed(2)},60,"note ${i}",2019-03-12T10:10:00`).join('\n');
    const text = `${head.replace('STOP.M  1504.50', `STOP.M  ${(1500 + (n - 1) * 0.5).toFixed(2)}`)}~Log_Data | Log_Definition\n${body}\n`;
    const { text3 } = door(text);
    expect(text3.skipped).toEqual([{ mnemonic: 'LITH', reason: `${n} distinct values is free text, which is not stored as a curve` }]);
    expect(text3.logs.map((l) => l.mnemonic)).toEqual(['TIME']);
  });
});

describe('in the LAS dialog', () => {
  beforeAll(() => {
    installDomShims();
    jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, { get: () => () => ({ width: 0 }), set: () => true }));
  });

  test('a new well gets the coded and time curves with their badges', async () => {
    mockBackend = makeInMemoryBackend({ seedSharedWell: false });
    render(<MemoryRouter><WellDataManager /></MemoryRouter>);
    await screen.findByTestId('wdm-tree');
    fireEvent.click(screen.getByTestId('wdm-open-las'));
    fireEvent.change(await screen.findByTestId('wdm-las-file'), { target: { files: [{ name: 'las30_tops_strings.las', text: async () => TEXT }] } });
    expect(await screen.findByTestId('wdm-las-text')).toHaveTextContent('LITH as codes (1 = SH 0, 2 = SH 1, 3 = SH 2); TIME as seconds after 2019-03-12T10:10:00.000Z (no zone given, read as UTC)');
    expect(screen.getByTestId('wdm-las-text-check')).toBeChecked();
    fireEvent.change(screen.getByTestId('wdm-las-x'), { target: { value: '501000' } });
    fireEvent.change(screen.getByTestId('wdm-las-y'), { target: { value: '6700200' } });
    fireEvent.click(screen.getByTestId('wdm-las-import'));
    await waitFor(() => expect(screen.getByTestId('wdm-detail-name')).toHaveTextContent('L3-TOPS'));
    const detail = screen.getByTestId('wdm-detail');
    fireEvent.click(within(detail).getByRole('button', { name: /^Logs/ }));
    await screen.findByTestId('wdm-logs-table');
    expect(screen.getByTestId('wdm-log-origin-LITH')).toHaveTextContent('coded text');
    expect(screen.getByTestId('wdm-log-origin-LITH').getAttribute('title')).toContain('1 = SH 0, 2 = SH 1, 3 = SH 2');
    expect(screen.getByTestId('wdm-log-origin-TIME')).toHaveTextContent('time channel');
  });

  test('into a well on another depth grid the text curves are not offered, with the reason', async () => {
    mockBackend = makeInMemoryBackend({ seedSharedWell: false });
    const w = await mockBackend.saveWell({ name: 'OTHER GRID', surfaceX: 1, surfaceY: 2 });
    const depth = Float32Array.from({ length: 5 }, (_, i) => 1500 + i * 0.25);
    await mockBackend.saveLogs(w.id, [{ mnemonic: 'DEPT', unit: 'M', data: depth, startMdM: 1500, stopMdM: 1501, stepM: 0.25, nSamples: 5, nullCount: 0 }]);
    render(<MemoryRouter><WellDataManager /></MemoryRouter>);
    fireEvent.click((await screen.findAllByTestId('wdm-well-row'))[0]);
    fireEvent.click(screen.getByTestId('wdm-open-las'));
    fireEvent.change(await screen.findByTestId('wdm-las-file'), { target: { files: [{ name: 'las30_tops_strings.las', text: async () => TEXT }] } });
    await waitFor(() => expect(screen.getByTestId('wdm-las-target-note')).toHaveTextContent('curves resample onto it'));
    expect(screen.getByTestId('wdm-las-text-check')).toBeDisabled();
    expect(screen.getByTestId('wdm-las-text')).toHaveTextContent('coded values cannot be resampled');
  });
});
