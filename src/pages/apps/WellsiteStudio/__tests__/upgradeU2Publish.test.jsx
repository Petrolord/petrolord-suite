// Wellsite Studio upgrade U2-010 (2026-10-01): the publish plan and the
// staged publish. The registry is the fake transport's (the same ops port
// the Supabase transport implements); failures are injected at each step
// and the registry is compared row for row with what it held before.
import 'fake-indexeddb/auto';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellsiteWorkstation from '../components/WellsiteWorkstation';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { makeLocalBackend } from '../services/localBackend';
import { makeFakeTransport } from '../services/transports/fakeTransport';
import { seedWellsite, SEED_REGISTRY_WELLS } from '../services/seed';
import { publishPlan, runPublish, publishFailureText, planLines, PROGNOSIS_SUFFIX } from '../services/publish';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, dock, statusBar }) => <div data-testid="ws-desktop">{ribbon}{explorer}{center}{dock}{statusBar}</div> }));

const GEO = 'geo-keta-2';
let n = 0;
async function make() {
  const db = openWellsiteDb(`ws-u2-pub-${n += 1}`);
  const transport = makeFakeTransport({ registryWells: SEED_REGISTRY_WELLS });
  const backend = makeLocalBackend({ transport, db, autoSync: false });
  const well = await seedWellsite(backend);
  // a prognosis top typed in Well Data Manager (another source), and an unrelated one
  const reg = transport._server.tables;
  const tops = new Map([['wdm-agbada', { id: 'wdm-agbada', well_id: GEO, name: 'Top Agbada', md_m: 3100, interpreter: 'Office', notes: null }], ['wdm-benin', { id: 'wdm-benin', well_id: GEO, name: 'Top Benin', md_m: 2000, interpreter: 'Office', notes: null }]]);
  reg.set('registry_tops', tops);
  const depth = (ft) => ({ value: ft, unit: 'ft', reference: 'MD', datum: 'KB', kind: 'logged' });
  const call = await backend.addTop(well.id, { role: 'official', status: 'confirmed', name: 'Top Agbada', formationKey: 'top_agbada', basis: 'GR drop', depth: depth(10168) });
  await backend.addTopVersion(call.row, { status: 'final', basis: 'Agreed with town', depth: depth(10168) });
  await backend.addRecord(well.id, { kind: 'observation', subtype: 'cuttings_description', depth: { ...depth(9990), kind: 'lagged_sample' }, depth2: { ...depth(10000), kind: 'lagged_sample' }, payload: { components: [{ lithology: 'sandstone', percent: 100 }], comment: '', mode: 'quick' } });
  const registry = () => ({ tops: [...transport._server.tables.get('registry_tops').values()].map((t) => ({ ...t })), intervals: [...(transport._server.tables.get('registry_intervals') || new Map()).values()].map((t) => ({ ...t })) });
  return { db, transport, backend, well, registry };
}
const names = (r) => r.tops.map((t) => t.name).sort();
const publications = async (db) => (await db.outbox.toArray()).filter((o) => o.table === 'ws_publications').length;

describe('the plan: prognosis and actual kept apart, duplicates named', () => {
  test('the same-name top from another source is named with the name it would take; the other is untouched', async () => {
    const { backend, well } = await make();
    const { plan } = await backend.publishPlanFor(well.id);
    expect(plan.tops.map((t) => t.row.name)).toEqual(['Top Agbada']);
    expect(plan.duplicates).toEqual([expect.objectContaining({ id: 'wdm-agbada', name: 'Top Agbada', md_m: 3100, interpreter: 'Office', newName: `Top Agbada${PROGNOSIS_SUFFIX}` })]);
    expect(plan.untouchedTops).toBe(2);
    expect(planLines(plan)).toEqual([
      expect.stringMatching(/^1 final top\(s\) will be added as drilled: Top Agbada at 3099\.2 m MD\.$/),
      '1 lithology interval(s) from the current descriptions will be added.',
      '2 row(s) from other sources are not touched, except the renames you tick below.',
    ]);
  });
  test('published with the rename: the actual holds the plain name, the earlier row is the prognosis with a note saying why', async () => {
    const { backend, well, registry, db } = await make();
    const { result } = await backend.publishToRegistry(well.id, { renameIds: ['wdm-agbada'] });
    expect(result).toMatchObject({ ok: true, renamed: [{ id: 'wdm-agbada', from: 'Top Agbada', to: 'Top Agbada (prognosis)' }] });
    const r = registry();
    expect(names(r)).toEqual(['Top Agbada', 'Top Agbada (prognosis)', 'Top Benin']);
    const prog = r.tops.find((t) => t.id === 'wdm-agbada');
    expect(prog.notes).toMatch(/^Renamed from "Top Agbada" by a Wellsite Studio publish on \d{4}-\d{2}-\d{2}: kept apart from the top as drilled\.$/);
    expect(r.tops.find((t) => t.name === 'Top Agbada').notes).toMatch(/Wellsite Studio ws-1\.0\.0 \| top /);
    expect(r.intervals).toHaveLength(1);
    expect(await publications(db)).toBe(1);
    // a republish replaces only its own row and finds no duplicate left to name
    const again = await backend.publishToRegistry(well.id, {});
    expect(again.plan.duplicates).toEqual([]);
    expect(again.result.tops).toMatchObject({ replaced: 1 });
    expect(names(registry())).toEqual(['Top Agbada', 'Top Agbada (prognosis)', 'Top Benin']);
  });
  test('without the rename both stay under one name and the plan still names the duplicate', async () => {
    const { backend, well, registry } = await make();
    const { plan, result } = await backend.publishToRegistry(well.id, { renameIds: [] });
    expect(result.renamed).toEqual([]);
    expect(plan.duplicates).toHaveLength(1);
    expect(names(registry())).toEqual(['Top Agbada', 'Top Agbada', 'Top Benin']);
  });
});

describe('staged with rollback: a failure at any step leaves the registry as it was', () => {
  const STEPS = [
    ['insertTop', 0, 'insert the new tops'],
    ['insertInterval', 0, 'insert the new lithology intervals'],
    ['renameTop', 0, 'rename the earlier tops kept apart as the prognosis'],
    ['deleteTop', 0, 'remove the tops this app published before'],
    ['deleteInterval', 0, 'remove the intervals this app published before'],
  ];
  test.each(STEPS)('%s failing: the publish reports the step, everything is undone, nothing is logged as published', async (op, after, stepText) => {
    const { backend, well, registry, transport, db } = await make();
    // a first good publish, so there are earlier own rows to replace (and to put back)
    await backend.publishToRegistry(well.id, {});
    const before = registry();
    const pubs = await publications(db);
    transport._server.knobs.registryFail = { op, after, once: true, message: 'Failed to fetch' };
    let err = null;
    try { await backend.publishToRegistry(well.id, { renameIds: ['wdm-agbada'] }); } catch (e) { err = e; }
    expect(err).not.toBeNull();
    expect(err.report).toMatchObject({ ok: false, failedAt: stepText, error: 'Failed to fetch', rolledBack: true, rollbackErrors: [] });
    expect(err.message).toBe(`The publish stopped at "${stepText}": Failed to fetch. Every step already taken was undone: the registry holds what it held before.`);
    const after2 = registry();
    // the same tops by name, depth and notes (a row put back gets a new id, its content is what it was)
    const key = (t) => `${t.name}|${t.md_m}|${t.notes || ''}`;
    expect(after2.tops.map(key).sort()).toEqual(before.tops.map(key).sort());
    expect(after2.intervals.map((i) => `${i.top_md_m}|${i.base_md_m}|${i.code}`).sort()).toEqual(before.intervals.map((i) => `${i.top_md_m}|${i.base_md_m}|${i.code}`).sort());
    expect(await publications(db)).toBe(pubs);
    // and the next publish goes through
    expect((await backend.publishToRegistry(well.id, {})).result.ok).toBe(true);
  });
  test('negative control: the old order (delete first, then insert) loses the tops when the insert fails', async () => {
    const { backend, well, registry, transport } = await make();
    await backend.publishToRegistry(well.id, {});
    const { plan } = await backend.publishPlanFor(well.id);
    const ops = transport.registryOps(GEO);
    transport._server.knobs.registryFail = { op: 'insertTop', after: 0, once: true };
    for (const t of plan.replaceTops) await ops.deleteTop(t);
    await expect(ops.insertTop(plan.tops[0].row)).rejects.toThrow('Failed to fetch');
    expect(registry().tops.some((t) => /Wellsite Studio/.test(t.notes || ''))).toBe(false);
  });
  test('when an undo itself fails the report names the rows left to tidy', async () => {
    const calls = [];
    const ops = {
      insertTop: async (row) => { calls.push(['insertTop', row.name]); return { id: `n-${calls.length}` }; },
      insertInterval: async () => { throw new Error('quota exceeded'); },
      deleteTop: async () => { throw new Error('Failed to fetch'); },
      renameTop: async () => ({}), deleteInterval: async () => {}, uploadPhoto: async () => ({ id: 'p' }),
    };
    const plan = { tops: [{ row: { name: 'Top Agbada', md_m: 3099 }, source: { id: 't1' } }], intervals: [{ row: { top_md_m: 3000, base_md_m: 3010 } }], duplicates: [], replaceTops: [], replaceIntervals: [], untouchedTops: 0, untouchedIntervals: 0 };
    const r = await runPublish({ plan, ops });
    expect(r).toMatchObject({ ok: false, failedAt: 'insert the new lithology intervals', error: 'quota exceeded', rolledBack: false, rollbackErrors: ['remove the new top Top Agbada: Failed to fetch'] });
    expect(publishFailureText(r)).toBe('The publish stopped at "insert the new lithology intervals": quota exceeded. Undoing it did not fully succeed, so the registry needs tidying in Well Data Manager: remove the new top Top Agbada: Failed to fetch.');
  });
  test('a photograph that fails to upload is reported and the tops stand', async () => {
    const ops = { insertTop: async () => ({ id: 'a' }), insertInterval: async () => ({ id: 'b' }), renameTop: async () => ({}), deleteTop: async () => {}, deleteInterval: async () => {}, uploadPhoto: async () => { throw new Error('too large'); } };
    const plan = publishPlan({ tops: [], records: [], profile: null });
    const r = await runPublish({ plan: { ...plan, tops: [{ row: { name: 'T', md_m: 1 }, source: { id: 's' } }] }, ops, photos: [{ photo: { id: 'ph1' }, blob: {} }] });
    expect(r).toMatchObject({ ok: true, tops: { ids: ['a'] }, photos: { ids: [], failed: [{ id: 'ph1', error: 'too large' }] } });
  });
});

test('screen: Publish shows the plan with the duplicate named, the rename is the user choice, the status says what happened', async () => {
  const { backend, registry } = await make();
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  fireEvent.click(screen.getByTestId('ws-nav-tops'));
  await waitFor(() => expect(screen.getByTestId('ws-top-row-top_agbada')).toHaveAttribute('data-status', 'final'));
  await act(async () => { fireEvent.click(screen.getByTestId('ws-top-publish')); });
  const lines = await screen.findByTestId('ws-publish-plan-lines');
  expect(lines).toHaveTextContent('1 final top(s) will be added as drilled: Top Agbada at 10168 ft MD.');
  expect(screen.getByTestId('ws-publish-duplicates')).toHaveTextContent('Rename the earlier Top Agbada at 10171 ft (Office) to Top Agbada (prognosis)');
  // nothing is written until Publish is pressed
  expect(names(registry())).toEqual(['Top Agbada', 'Top Benin']);
  expect(screen.getByTestId('ws-publish-rename-wdm-agbada')).toBeChecked();
  await act(async () => { fireEvent.click(screen.getByTestId('ws-publish-confirm')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('Published to the registry: 1 final top(s) (0 replaced), 1 lithology interval(s) (0 replaced); 1 row(s) from other sources untouched. Top Agbada from the earlier source is now Top Agbada (prognosis).'));
  expect(names(registry())).toEqual(['Top Agbada', 'Top Agbada (prognosis)', 'Top Benin']);
  await waitFor(() => expect(screen.queryByTestId('ws-publish-plan')).toBeNull());
});
