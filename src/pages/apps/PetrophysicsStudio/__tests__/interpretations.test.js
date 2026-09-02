// PS3: named-interpretation CRUD on the in-memory backend (the
// registryBackend contract twin) — list/open/save-as/rename/delete,
// most-recent-wins loadProject, and migration of a pre-PS3
// single-object sessionStorage payload.

import { makeInMemoryBackend } from '../services/inMemoryBackend';

const tick = () => new Promise((r) => { setTimeout(r, 2); });

test('save creates, save-as forks, rename and delete work, list is newest-first', async () => {
  const b = makeInMemoryBackend();

  const first = await b.saveProject({ params: { rw: 0.05 }, zone_params: {} });
  expect(first.id).toBeTruthy();
  expect(first.name).toBe('Default interpretation');

  await tick();
  const fork = await b.saveProjectAs('High Rw case', { params: { rw: 0.09 }, zone_params: { z1: { m: 1.9 } } });
  expect(fork.name).toBe('High Rw case');
  expect(fork.id).not.toBe(first.id);

  // newest first; loadProject opens the fork
  const list = await b.listProjects();
  expect(list.map((p) => p.name)).toEqual(['High Rw case', 'Default interpretation']);
  expect((await b.loadProject()).id).toBe(fork.id);

  // open by id returns the full row
  const opened = await b.openProject(first.id);
  expect(opened.params.rw).toBe(0.05);

  // update the OPEN interpretation only
  await tick();
  await b.saveProject({ params: { rw: 0.06 } }, first.id);
  expect((await b.openProject(first.id)).params.rw).toBe(0.06);
  expect((await b.openProject(fork.id)).params.rw).toBe(0.09);

  const renamed = await b.renameProject(fork.id, 'Best case');
  expect(renamed.name).toBe('Best case');

  await b.deleteProject(fork.id);
  expect((await b.listProjects()).map((p) => p.name)).toEqual(['Default interpretation']);
  await expect(b.openProject(fork.id)).rejects.toThrow(/not found/);
});

test('zone_params round-trips through save and open', async () => {
  const b = makeInMemoryBackend();
  const zp = { 'zone-1': { rw: 0.03, m: 1.9 }, 'zone-2': { cutSw: 0.7 } };
  const p = await b.saveProject({ params: {}, zone_params: zp });
  expect((await b.openProject(p.id)).zone_params).toEqual(zp);
});

test('a pre-PS3 single-object payload migrates to a one-entry list', async () => {
  const b = makeInMemoryBackend();
  const legacy = { id: 'project-legacy', name: 'Default project', params: { rw: 0.07 }, updated_at: '2026-08-01T00:00:00Z' };
  window.sessionStorage.setItem('petro.dev.project.v1', JSON.stringify(legacy));
  const loaded = await b.loadProject();
  expect(loaded.id).toBe('project-legacy');
  expect((await b.listProjects())).toHaveLength(1);
  // saving under its id keeps the single row
  await b.saveProject({ params: { rw: 0.08 } }, 'project-legacy');
  expect((await b.listProjects())).toHaveLength(1);
  expect((await b.loadProject()).params.rw).toBe(0.08);
});
