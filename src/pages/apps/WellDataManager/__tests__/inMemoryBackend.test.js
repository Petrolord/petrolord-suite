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

describe('one name per registry (owner rule 2026-09-03)', () => {
  test('a second well with the same name is refused, in any case or spacing', async () => {
    const b = makeInMemoryBackend();
    const first = await b.saveWell({ ...HEADER, name: 'Dup Test-1' });
    expect(first.name).toBe('Dup Test-1');
    await expect(b.saveWell({ ...HEADER, name: 'Dup Test-1' })).rejects.toThrow(/already exists in your registry/);
    await expect(b.saveWell({ ...HEADER, name: '  dup   test-1 ' })).rejects.toThrow(/already exists in your registry/);
    expect((await b.listWells()).filter((w) => w.name === 'Dup Test-1')).toHaveLength(1);
  });
  test('a name matching the org-shared well is refused too', async () => {
    const b = makeInMemoryBackend();
    const shared = (await b.listWells()).find((w) => !w.is_own);
    await expect(b.saveWell({ ...HEADER, name: shared.name.toUpperCase() })).rejects.toThrow(/shared with you by a teammate/);
  });
  test('renaming onto another well is refused; renaming to itself is fine', async () => {
    const b = makeInMemoryBackend();
    const a = await b.saveWell({ ...HEADER, name: 'Rename A' });
    await b.saveWell({ ...HEADER, name: 'Rename B' });
    await expect(b.updateWell(a.id, { name: 'rename b' })).rejects.toThrow(/already exists/);
    const same = await b.updateWell(a.id, { name: ' Rename A ' });
    expect(same.name).toBe('Rename A');
  });
});

describe('PT1: well data edits (mirror of the registry rules)', () => {
  test('updateWellData rejects a non-monotonic checkshot table and a one-station survey', async () => {
    const b = makeInMemoryBackend();
    const w = await b.saveWell({ ...HEADER, name: 'EDIT-1' });
    await expect(b.updateWellData(w.id, { checkshots: [{ tvdss_m: 100, twt_ms: 200 }, { tvdss_m: 90, twt_ms: 260 }] })).rejects.toThrow(/strictly increase/);
    await expect(b.updateWellData(w.id, { deviation: [{ md: 0, inc: 0, azi: 0 }] })).rejects.toThrow(/at least 2 stations/);
    await expect(b.updateWellData(w.id, {})).rejects.toThrow(/Nothing to update/);
  });
  test('updateWellData is owner-only; a valid edit lands with its provenance', async () => {
    const b = makeInMemoryBackend();
    const shared = (await b.listWells()).find((w) => !w.is_own);
    await expect(b.updateWellData(shared.id, { kbM: 30 })).rejects.toThrow(/Only the owner/);
    const w = await b.saveWell({ ...HEADER, name: 'EDIT-2' });
    const prov = { units_in: { depth_ref: 'md', time: 'owt', depth_unit: 'm' }, source: 'wdm-edit', kb_m_used: 31.2 };
    const out = await b.updateWellData(w.id, { checkshots: [{ tvdss_m: 100, twt_ms: 200, md_m: 131.2 }, { tvdss_m: 200, twt_ms: 300, md_m: 231.2 }], checkshotsProvenance: prov, kbM: 31.2 });
    expect(out.checkshots).toHaveLength(2);
    expect(out.checkshots[0].md_m).toBe(131.2);
    expect(out.checkshots_provenance).toEqual(prov);
    expect(out.kb_m).toBe(31.2);
  });
  test('tops can be added, moved, renamed and deleted by the owner and stay MD-sorted', async () => {
    const b = makeInMemoryBackend();
    const w = await b.saveWell({ ...HEADER, name: 'TOPS-1' });
    const a = await b.saveTop(w.id, { name: 'Top B', mdM: 1500 });
    await b.saveTop(w.id, { name: 'Top A', mdM: 1400 });
    expect((await b.listTops(w.id)).map((t) => t.name)).toEqual(['Top A', 'Top B']);
    await b.updateTop(a.id, { mdM: 1300, name: 'Top B2' });
    expect((await b.listTops(w.id)).map((t) => t.name)).toEqual(['Top B2', 'Top A']);
    await b.deleteTop(a);
    expect(await b.listTops(w.id)).toHaveLength(1);
    const shared = (await b.listWells()).find((x) => !x.is_own);
    await expect(b.saveTop(shared.id, { name: 'X', mdM: 1 })).rejects.toThrow(/Only the owner/);
  });
  test('the seeded shared well carries a Petrel-entered checkshot table with provenance', async () => {
    const b = makeInMemoryBackend();
    const shared = (await b.listWells()).find((w) => !w.is_own);
    expect(shared.checkshots_provenance.units_in).toEqual({ depth_ref: 'md', time: 'owt', depth_unit: 'ft' });
    expect(shared.checkshots[0].md_m).toBe(304.8);
  });
});
