/**
 * Seismolord import door (tester group 6): the committed Charisma
 * horizon and fault-stick files import through the REAL dialog and the
 * Suite service path with the right number of points; the reject
 * report names lines and columns; a multi-horizon file creates one
 * horizon per ticked name; a generic table goes through the column
 * mapping step; the content decides the kind whatever the extension.
 * Storage writes (saveHorizon / saveFault) are mocked; everything
 * between the file and those calls is real.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import {
  render, screen, fireEvent, waitFor, within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import ImportSurfaceDialog, { readImportFile } from '@/pages/apps/Seismolord/components/workspace/dialogs/ImportSurfaceDialog';
import RejectReport from '@/pages/apps/Seismolord/components/workspace/dialogs/import/RejectReport';
import {
  saveImportedHorizons, saveImportedFaults, landHorizons,
} from '@/pages/apps/Seismolord/services/interpretationImport';
import { saveHorizon } from '@/pages/apps/Seismolord/services/horizonsService';
import { saveFault } from '@/pages/apps/Seismolord/services/faultsService';

jest.mock('@/pages/apps/Seismolord/services/horizonsService', () => ({
  saveHorizon: jest.fn(async ({ name }) => ({ id: `h-${name}`, name })),
}));
jest.mock('@/pages/apps/Seismolord/services/faultsService', () => ({
  saveFault: jest.fn(async ({ name }) => ({ id: `f-${name}`, name })),
  listFaults: jest.fn(async () => []),
}));
jest.mock('@/components/crs/useCrsContext', () => () => ({ crsContext: null }));
jest.mock('@/components/crs/CrsPicker', () => () => null);

// jsdom 20 has no Blob#text
if (typeof File.prototype.text !== 'function') {
  // eslint-disable-next-line func-names
  File.prototype.text = function () {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsText(this);
    });
  };
}

const DATA = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'seismolord');
const fixture = (dir, f) => fs.readFileSync(path.join(DATA, dir, f), 'utf8');

// the survey the engine fixtures were written against (see their README)
const MANIFEST = {
  geometry: {
    il: { min: 1000, step: 2, count: 6 },
    xl: { min: 2000, step: 1, count: 8 },
    ns: 500,
    dt_us: 4000,
    affine: {
      origin: { x: 456000, y: 6780000 },
      il_vec: { x: 0, y: 25 },
      xl_vec: { x: 12.5, y: 0 },
    },
  },
  brick: { size: 16, grid: [1, 1, 32] },
};
const VOLUME = { id: 'v1', name: 'Fixture survey', crs: null };
const NULL_F32 = Math.fround(1.0e30);
const live = (picks) => picks.reduce((n, v) => n + (v !== NULL_F32 ? 1 : 0), 0);

beforeEach(() => {
  saveHorizon.mockClear();
  saveFault.mockClear();
});

const renderDialog = (props = {}) => {
  const handlers = {
    onOpenChange: jest.fn(),
    onHorizonImported: jest.fn(),
    onFaultsImported: jest.fn(),
    onSurfaceImported: jest.fn(),
  };
  render(
    <ImportSurfaceDialog open volume={VOLUME} manifest={MANIFEST} {...handlers} {...props} />,
  );
  return handlers;
};

const upload = (name, text) => {
  const file = new File([text], name, { type: '' });
  fireEvent.change(screen.getByTestId('sl-import-file'), { target: { files: [file] } });
};

describe('dialog path: Charisma horizon file', () => {
  test('a Petrel Charisma file imports as one horizon with 12 points on 12 cells', async () => {
    const h = renderDialog();
    upload('charisma3d_petrel.txt', fixture('picks', 'charisma3d_petrel.txt'));
    const preview = await screen.findByTestId('sl-import-preview');
    expect(preview).toHaveTextContent('Charisma 3D interpretation lines: 1 horizon, 12 points');
    expect(screen.getByTestId('sl-import-kind')).toHaveValue('picks');
    expect(screen.queryByTestId('sl-import-rejects')).toBeNull();
    fireEvent.click(screen.getByTestId('sl-import-go'));
    await waitFor(() => expect(saveHorizon).toHaveBeenCalledTimes(1));
    const call = saveHorizon.mock.calls[0][0];
    expect(call.name).toBe('charisma3d_petrel');
    expect(live(call.picks)).toBe(12);
    // positive-down ms: auto sign reads it as Petrel; 1500 ms at il 1000 / xl 2000 -> sample 375
    expect(call.picks[0]).toBeCloseTo(375, 6);
    expect(call.params.source).toMatchObject({
      format: 'charisma', rows: 12, placed: 12, skipped: 0, rejected_rows: 0, z_sign: 'positive_down',
    });
    expect(h.onHorizonImported).toHaveBeenCalled();
  });

  test('the tester variants (joined, split, no XLINE marker, tabs, header) import 10 points', async () => {
    renderDialog();
    upload('H1 export', fixture('picks', 'charisma3d_tester_variants.txt'));   // no extension
    expect(await screen.findByTestId('sl-import-preview')).toHaveTextContent('10 points');
    fireEvent.click(screen.getByTestId('sl-import-go'));
    await waitFor(() => expect(saveHorizon).toHaveBeenCalledTimes(1));
    expect(live(saveHorizon.mock.calls[0][0].picks)).toBe(10);
  });

  test('bad rows: the reject report names lines and columns; the 9 good points import', async () => {
    renderDialog();
    upload('bad.hor', fixture('picks', 'charisma3d_bad_rows.txt'));
    const report = await screen.findByTestId('sl-import-rejects');
    expect(within(report).getByTestId('sl-import-rejects-summary'))
      .toHaveTextContent('3 lines could not be read (9 read).');
    const rows = within(report).getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(rows[0]).toMatch(/^49 \(z\)"n\/a" is not a number/);
    expect(rows[1]).toMatch(/^89 \(z\)expected x y z after the crossline, found 2 numbers/);
    expect(rows[2]).toMatch(/^98 \(y\)/);
    fireEvent.click(screen.getByTestId('sl-import-go'));
    await waitFor(() => expect(saveHorizon).toHaveBeenCalledTimes(1));
    expect(live(saveHorizon.mock.calls[0][0].picks)).toBe(9);
    expect(saveHorizon.mock.calls[0][0].params.source.rejected_rows).toBe(3);
  });

  test('a multi-horizon file creates one horizon per ticked name', async () => {
    renderDialog();
    upload('two.txt', fixture('picks', 'charisma3d_named_multi.txt'));
    const box = await screen.findByTestId('sl-import-multi');
    expect(box).toHaveTextContent('This file holds 2 horizons');
    expect(screen.getByTestId('sl-import-go')).toHaveTextContent('Import 2 horizons');
    fireEvent.click(within(box).getAllByRole('checkbox')[1]);           // untick Base_Reservoir
    expect(screen.getByTestId('sl-import-go')).toHaveTextContent('Import 1 horizon');
    fireEvent.click(screen.getByTestId('sl-import-go'));
    await waitFor(() => expect(saveHorizon).toHaveBeenCalledTimes(1));
    expect(saveHorizon.mock.calls[0][0].name).toBe('Top_Reservoir');
    expect(live(saveHorizon.mock.calls[0][0].picks)).toBe(8);
  });
});

describe('dialog path: Charisma fault-stick file', () => {
  test('content switches the kind to fault sticks; 2 faults, 10 points saved', async () => {
    const h = renderDialog();
    upload('faults.dat', fixture('faults', 'charisma_faultsticks_petrel.txt'));
    expect(await screen.findByTestId('sl-import-preview'))
      .toHaveTextContent('Charisma fault sticks: 2 faults, 4 sticks, 10 points');
    expect(screen.getByTestId('sl-import-kind')).toHaveValue('faults');
    fireEvent.click(screen.getByTestId('sl-import-go'));
    await waitFor(() => expect(saveFault).toHaveBeenCalledTimes(2));
    const [a, b] = saveFault.mock.calls.map((c) => c[0]);
    expect(a.name).toBe('Fault_A');
    expect(b.name).toBe('Fault_B');
    const points = [a, b].reduce((n, f) => n + f.sticks.reduce((m, s) => m + s.points.length, 0), 0);
    expect(points).toBe(10);
    expect(a.sticks.map((s) => s.points.length)).toEqual([3, 3]);
    expect(a.params.source).toMatchObject({ format: 'charisma', rows: 10, placed: 10 });
    expect(h.onFaultsImported).toHaveBeenCalledWith(expect.arrayContaining([{ id: 'f-Fault_A', name: 'Fault_A' }]));
  });

  test('opened from the Horizons section with a fault file: suggests switching, does not switch', async () => {
    renderDialog({ initialKind: 'picks' });
    upload('faults.txt', fixture('faults', 'charisma_faultsticks_tester_variants.txt'));
    const hint = await screen.findByTestId('sl-import-suggestion');
    expect(hint).toHaveTextContent('This file looks like Charisma fault sticks');
    expect(screen.getByTestId('sl-import-kind')).toHaveValue('picks');
    fireEvent.click(within(hint).getByRole('button', { name: /Import it as Fault sticks/ }));
    expect(screen.getByTestId('sl-import-kind')).toHaveValue('faults');
    expect(await screen.findByTestId('sl-import-preview')).toHaveTextContent('9 points');
  });

  test('a generic table goes through the column mapping step', async () => {
    renderDialog({ initialKind: 'faults' });
    upload('sticks.csv', fixture('faults', 'generic_faultsticks.csv'));
    const mapping = await screen.findByTestId('sl-import-mapping');
    expect(within(mapping).getByTestId('sl-map-stick')).toHaveValue('1');
    expect(within(mapping).getByTestId('sl-map-z')).toHaveValue('4');
    expect(await screen.findByTestId('sl-import-preview')).toHaveTextContent('2 faults, 4 sticks, 10 points');
    // unmapping Z stops the read and says what is missing
    fireEvent.change(within(mapping).getByTestId('sl-map-z'), { target: { value: '' } });
    expect(screen.queryByTestId('sl-import-preview')).toBeNull();
    expect(mapping).toHaveTextContent('Map Z and either X and Y or inline and crossline');
  });
});

describe('service path', () => {
  test('landHorizons reports a horizon that misses the survey and lands the rest', () => {
    const { preview } = readImportFile({
      text: `${fixture('picks', 'charisma3d_named_multi.txt')}Far INLINE : 9000 XLINE : 9000 0 0 1500\n`,
      kind: 'picks',
    });
    const { landed, failed } = landHorizons({ parsed: preview, manifest: MANIFEST, sign: 1 });
    expect(landed.map((h) => [h.name, h.placed])).toEqual([['Top_Reservoir', 8], ['Base_Reservoir', 6]]);
    expect(failed).toEqual([{ name: 'Far', error: expect.stringMatching(/No picks landed/) }]);
  });

  test('IESX horizons and IESX fault sticks save through the same services', async () => {
    const hz = readImportFile({ text: fixture('picks', 'iesx3d_petrel_two_horizons.txt'), kind: 'picks' }).preview;
    const outH = await saveImportedHorizons({
      volume: VOLUME, manifest: MANIFEST, parsed: hz, sign: 1, source: { file_name: 'x' },
    });
    expect(outH.saved.map((s) => s.name)).toEqual(['H1_TWT', 'H2_TWT']);
    expect(outH.landed.map((l) => l.placed)).toEqual([6, 3]);
    const ft = readImportFile({ text: fixture('faults', 'iesx_faultsticks.txt'), kind: 'faults' }).preview;
    const outF = await saveImportedFaults({
      volume: VOLUME, manifest: MANIFEST, parsed: ft, sign: 1, source: { file_name: 'y' },
    });
    expect(outF.placed).toBe(10);
    expect(outF.saved.map((s) => s.name)).toEqual(['Fault_A', 'Fault_B']);
  });

  test('a file with nothing readable surfaces the refusal with its rejects', () => {
    const r = readImportFile({ text: 'INLINE : 1 XLINE : b 1 2 3\n', kind: 'picks' });
    expect(r.preview).toBeNull();
    expect(r.error).toMatch(/No horizon picks could be read.*Line 1, column 6 \(crossline\)/);
    expect(r.rejectCount).toBe(1);
  });
});

describe('RejectReport', () => {
  test('caps the preview and says how many there are', () => {
    const rejects = Array.from({ length: 40 }, (_, i) => ({ line: i + 1, reason: 'bad', column: 3, field: 'z', text: 'x' }));
    render(<RejectReport rejects={rejects} count={1234} read={10} />);
    expect(screen.getByTestId('sl-import-rejects-summary')).toHaveTextContent('1,234 lines could not be read (10 read).');
    expect(screen.getAllByRole('row')).toHaveLength(26);             // header + 25
    expect(screen.getByText('Showing the first 25 of 1,234.')).toBeInTheDocument();
  });
});
