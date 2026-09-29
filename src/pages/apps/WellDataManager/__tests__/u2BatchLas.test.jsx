/**
 * WDM-U2-004: batch LAS import matched by UWI or name. PL2: a hostile
 * batch (a UWI spelled differently, a read-only org well, a TVDSS-indexed
 * file, a text file, the same file twice, two runs of one new well, a file
 * with no WELL, a file with no location) where every file ends imported,
 * skipped or failed with its reason, and nothing lands in the wrong well.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { planBatch, checkBatch } from '../engine/batchMatch';
import { runBatchImport, batchSummary } from '../services/batchImport';
import WellDataManager from '../WellDataManager';

jest.setTimeout(30000);

let mockBackend = null;
jest.mock('../services/registryBackend', () => ({ makeRegistryBackend: () => mockBackend }));
const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');

const HOSTILE = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'wdm', 'hostile');
const hostile = (f) => ({ name: f, text: async () => fs.readFileSync(path.join(HOSTILE, f), 'utf8') });
const las = (name, well, uwi = null, start = 1000) => ({
  name,
  text: async () => ['~Version', 'VERS. 2.0 : CWLS', 'WRAP. NO :', '~Well',
    `STRT.M ${start} :`, `STOP.M ${start + 1} :`, 'STEP.M 0.5 :', 'NULL. -999.25 :', `WELL. ${well} :`,
    ...(uwi ? [`UWI . ${uwi} :`] : []), '~Curve', 'DEPT.M : depth', 'GR.GAPI : gamma', '~A',
    `${start} 50`, `${start + 0.5} 60`, `${start + 1} 70`, ''].join('\n'),
});

const FILES = [
  hostile('las20_petrel_export.las'),       // 0 UWI 00-1234-5678 -> OLD NAME (UWI spelled with spaces)
  las('a2.las', 'Another name', 'AKOMA-2'), // 1 UWI of the org well: read-only
  hostile('las20_tvdss_index.las'),         // 2 refused at the door
  { name: 'notes.txt', text: async () => 'hello, this is not a LAS file' }, // 3 not LAS
  hostile('las20_petrel_export.las'),       // 4 same file name again
  las('NEW-7_run1.las', 'NEW-7'),           // 5 new well, no location
  las('NEW-7_run2.las', 'new-7', null, 1000.5), // 6 same new well (case), shifted grid
  las('noname.las', ''),                    // 7 no WELL: named from the file
  hostile('las20_slb_tdep_upward.las'),     // 8 new well, the user skips it
];

async function seed() {
  const b = makeInMemoryBackend({ worker: false });
  await b.saveWell({ name: 'OLD NAME', uwi: '00 1234 5678', surfaceX: 1, surfaceY: 2, kbM: 20 });
  return b;
}
async function parseAll(b) {
  const out = [];
  for (const f of FILES) {
    try { out.push({ fileName: f.name, parsed: await b.parseLasFile(f) }); } catch (e) { out.push({ fileName: f.name, error: e.message }); }
  }
  return out;
}

describe('planning a hostile batch (engine)', () => {
  test('every file is matched or skipped with its reason', async () => {
    const b = await seed();
    const files = await parseAll(b);
    const rows = planBatch(files, await b.listWells());
    const pick = (i) => rows[i];
    expect(pick(0)).toMatchObject({ action: 'into', note: 'matched by UWI to OLD NAME' });
    expect(pick(1)).toMatchObject({ action: 'skip', reason: 'AKOMA-2 (org shared) is shared with you read-only' });
    expect(pick(2).action).toBe('skip');
    expect(pick(2).reason).toMatch(/indexed by TVDSS/);
    expect(pick(3).action).toBe('skip');
    expect(pick(4)).toMatchObject({ action: 'skip', reason: 'the same file name as row 1' });
    expect(pick(5)).toMatchObject({ action: 'new', note: 'new well' });
    expect(pick(6)).toMatchObject({ action: 'new', note: 'goes into the new well from row 6' });
    expect(pick(7)).toMatchObject({ action: 'new', wellName: 'noname', nameFromFile: true });
    expect(checkBatch(rows)).toEqual([
      'Row 6 (NEW-7): a new well needs its surface X and Y.',
      'Row 8 (noname): a new well needs its surface X and Y.',
      'Row 9 (SLB TD-3): a new well needs its surface X and Y.',
    ]);
  });

  test('the run lands every file in the right well; two runs of one new well make one well', async () => {
    const b = await seed();
    const files = await parseAll(b);
    const rows = planBatch(files, await b.listWells());
    rows[8] = { ...rows[8], action: 'skip', reason: 'skipped by you' };
    const typedXy = { 5: { x: '501000', y: '6700100' }, 7: { x: '501500', y: '6700600' } };
    expect(checkBatch(rows, typedXy)).toEqual([]);
    const progress = [];
    const { results } = await runBatchImport({ backend: b, rows, files, typedXy, onProgress: (p) => progress.push(p.done) });
    expect(results.map((r) => r.status)).toEqual(['done', 'skipped', 'skipped', 'skipped', 'skipped', 'done', 'done', 'done', 'skipped']);
    expect(batchSummary(results)).toBe('Batch LAS: 4 files imported into 3 wells (2 new), 5 skipped, 0 failed.');
    expect(progress).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const wells = await b.listWells();
    expect(wells.map((w) => w.name).sort()).toEqual(['AKOMA-2 (org shared)', 'NEW-7', 'OLD NAME', 'noname']);
    const old = wells.find((w) => w.name === 'OLD NAME');
    expect((await b.listLogs(old.id)).map((l) => l.mnemonic)).toEqual(['DEPT', 'GR', 'RHOB', 'NPHI', 'DT']);
    const n7 = wells.find((w) => w.name === 'NEW-7');
    expect(n7.surface_x).toBe(501000);
    // second run: same GR name kept alongside, resampled onto the first run's grid
    expect((await b.listLogs(n7.id)).map((l) => l.mnemonic)).toEqual(['DEPT', 'GR', 'GR:2']);
    expect(results[6].message).toBe('1 curve, 1 resampled onto the well\'s depth grid, 1 kept alongside with a :n suffix');
    // nothing written to the read-only org well
    const org = wells.find((w) => w.name === 'AKOMA-2 (org shared)');
    expect(await b.listLogs(org.id)).toEqual([]);
  });

  test('a failure in one file is reported and the batch carries on; cancel stops after the current file', async () => {
    const b = await seed();
    const files = await parseAll(b);
    const rows = planBatch(files, await b.listWells());
    const typedXy = { 5: { x: '1', y: '2' }, 7: { x: '3', y: '4' }, 8: { x: '5', y: '6' } };
    const real = b.saveLogs.bind(b);
    let calls = 0;
    b.saveLogs = async (id, logs) => { calls += 1; if (calls === 1) throw new Error('storage quota reached'); return real(id, logs); };
    const cancel = { cancelled: false };
    const { results } = await runBatchImport({
      backend: b, rows, files, typedXy, cancel, onProgress: ({ done }) => { if (done === 7) cancel.cancelled = true; },
    });
    expect(results[0]).toMatchObject({ status: 'failed', message: 'storage quota reached' });
    expect(results[5].status).toBe('done');
    expect(results[7]).toMatchObject({ status: 'skipped', message: 'cancelled before this file' });
    expect(results[8]).toMatchObject({ status: 'skipped', message: 'cancelled before this file' });
  });
});

describe('the Batch LAS dialog', () => {
  const noopCtx = () => new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 0 }) : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  beforeAll(() => {
    installDomShims();
    jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(noopCtx);
  });

  test('review, type a location, import, read the summary', async () => {
    mockBackend = await seed();
    render(<MemoryRouter><WellDataManager /></MemoryRouter>);
    await screen.findAllByTestId('wdm-well-row');
    fireEvent.click(screen.getByTestId('wdm-open-batch'));
    fireEvent.change(await screen.findByTestId('wdm-batch-files'), { target: { files: [FILES[0], FILES[2], FILES[5]] } });
    await screen.findByTestId('wdm-batch-table');
    expect(screen.getAllByTestId('wdm-batch-row').map((r) => r.dataset.action)).toEqual(['into', 'skip', 'new']);
    expect(screen.getByTestId('wdm-batch-error')).toHaveTextContent('Row 3 (NEW-7): a new well needs its surface X and Y.');
    expect(screen.getByTestId('wdm-batch-import')).toBeDisabled();
    fireEvent.change(screen.getByTestId('wdm-batch-x-2'), { target: { value: '501000' } });
    fireEvent.change(screen.getByTestId('wdm-batch-y-2'), { target: { value: '6700100' } });
    expect(screen.getByTestId('wdm-batch-import')).toHaveTextContent('Import 2 files');
    fireEvent.click(screen.getByTestId('wdm-batch-import'));
    await screen.findByTestId('wdm-batch-results');
    expect(screen.getAllByTestId('wdm-batch-result').map((r) => r.dataset.status)).toEqual(['done', 'skipped', 'done']);
    await waitFor(() => expect(screen.getByTestId('wdm-status-message')).toHaveTextContent('Batch LAS: 2 files imported into 2 wells (1 new), 1 skipped, 0 failed.'));
    expect(screen.getAllByTestId('wdm-well-row').map((r) => r.dataset.wellName)).toContain('NEW-7');
  });
});
