/**
 * G1.3 — the in-memory backend IS the /dev harness's contract with the
 * app, so it must behave like the registry: same shapes, same
 * owner-only rules the RLS policies enforce server-side, same LAS
 * pipeline (real engine, inline in jest where module workers 404).
 * Drives the full import → view → share → delete flow the Playwright
 * smoke clicks through.
 */

import fs from 'fs';
import path from 'path';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'wells');
const lasFile = (name) => ({
  name: `${name}.las`,
  // only .text() and .name are touched on the inline (non-worker) path
  text: async () => fs.readFileSync(path.join(DATA_DIR, 'las', `${name}.las`), 'utf8'),
});

const HEADER = { name: 'KETA G1-1', uwi: 'KETA-G1-BASIC', surfaceX: 501000, surfaceY: 6700200, kbM: 31.2 };

describe('in-memory backend (harness contract)', () => {
  test('seeds one org-shared read-only well', async () => {
    const b = makeInMemoryBackend();
    const wells = await b.listWells();
    expect(wells).toHaveLength(1);
    expect(wells[0].is_own).toBe(false);
    expect(wells[0].organization_id).toBe(await b.myOrgId());
    const tops = await b.listTops(wells[0].id);
    expect(tops.map((t) => t.name)).toEqual(['Top Dome', 'Base Seal']);
  });

  test('full LAS import → view → share → delete flow', async () => {
    const b = makeInMemoryBackend();

    // parse (real engine) — suggestion comes from the ~Well section
    const { meta, prep } = await b.parseLasFile(lasFile('basic_20'));
    expect(meta.suggestedHeader.name).toBe('KETA G1-1');
    expect(meta.suggestedHeader.kbM).toBeCloseTo(31.2, 6);
    expect(prep.logs).toHaveLength(5); // DEPT + 4 curves
    expect(prep.stepM).toBeCloseTo(0.5, 6);

    // persist well + logs
    const well = await b.saveWell({ ...HEADER, tdMdM: meta.suggestedHeader.tdMdM });
    expect(well.is_own).toBe(true);
    expect(well.organization_id).toBeNull();
    const saved = await b.saveLogs(well.id, prep.logs);
    expect(saved).toHaveLength(5);

    // metadata rows point at retrievable curve objects
    const logs = await b.listLogs(well.id);
    const gr = logs.find((l) => l.mnemonic === 'GR');
    expect(gr.unit).toBe('GAPI');
    expect(gr.source_file).toBe('basic_20.las');
    const data = await b.downloadCurve(gr);
    expect(data).toBeInstanceOf(Float32Array);
    expect(data.length).toBe(gr.n_samples);

    // share stamps the org id on the well row; unshare clears it
    await b.shareWell(well.id);
    let wells = await b.listWells();
    expect(wells.find((w) => w.id === well.id).organization_id).toBe(await b.myOrgId());
    await b.unshareWell(well.id);
    wells = await b.listWells();
    expect(wells.find((w) => w.id === well.id).organization_id).toBeNull();

    // delete takes the children and curve objects with it
    await b.deleteWell(well);
    wells = await b.listWells();
    expect(wells.find((w) => w.id === well.id)).toBeUndefined();
    await expect(b.downloadCurve(gr)).rejects.toThrow(/no object/);
  });

  test('ft LAS converts to SI on import (provenance records the factor)', async () => {
    const b = makeInMemoryBackend({ seedSharedWell: false });
    const { prep } = await b.parseLasFile(lasFile('feet_20'));
    const dept = prep.logs[0];
    expect(dept.unit).toBe('M');
    expect(dept.sourceUnit).toBe('F'); // the fixture's LAS spells feet 'F'
    expect(dept.converted).toBe(true);
    expect(dept.provenance.factor).toBeCloseTo(0.3048, 12);
    const dt = prep.logs.find((l) => l.mnemonic === 'DT');
    expect(dt.unit).toBe('US/M'); // sonic slowness divides
  });

  test('owner-only rules mirror RLS: writes to the shared well throw', async () => {
    const b = makeInMemoryBackend();
    const [shared] = await b.listWells();
    await expect(b.updateWell(shared.id, { name: 'x' })).rejects.toThrow(/Only the owner/);
    await expect(b.deleteWell(shared)).rejects.toThrow(/Only the owner/);
    await expect(b.replaceTops(shared.id, [])).rejects.toThrow(/Only the owner/);
    await expect(b.saveLogs(shared.id, [])).rejects.toThrow(/Only the owner/);
    // reads stay open — that's what org sharing grants
    await expect(b.listTops(shared.id)).resolves.toHaveLength(2);
  });

  test('replaceTops normalizes and re-sorts by MD', async () => {
    const b = makeInMemoryBackend({ seedSharedWell: false });
    const well = await b.saveWell({ ...HEADER, tdMdM: 1700 });
    await b.replaceTops(well.id, [
      { name: 'B', md: 1600 },
      { name: 'A', md: 1500.5, interpreter: 'ayo' },
    ]);
    const tops = await b.listTops(well.id);
    expect(tops.map((t) => [t.name, t.md_m])).toEqual([['A', 1500.5], ['B', 1600]]);
    expect(tops[0].interpreter).toBe('ayo');
  });

  test('malformed LAS surfaces the engine domain error', async () => {
    const b = makeInMemoryBackend();
    const bad = { name: 'bad.las', text: async () => '~A\n1 2 3\n' };
    await expect(b.parseLasFile(bad)).rejects.toThrow(/~Curve|section/i);
  });
});
