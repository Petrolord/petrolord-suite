// PT10a (owner decision 2, 2026-09-09): the petro-project state kind moves
// to version 2 with a one-time migration of a stored `none` to the current
// code default. The testers' shared interpretation, saved before PT9a,
// stored permMethod none; the workstation merged it over the defaults on
// open, so the PT9a Timur default never reached it and no permeability was
// computed. These gates pin the step, its provenance entry, the explicit
// deliberateNone flag that makes a chosen none permanent, the reversal
// path, and a regression fixture in the pre-PT9a shape opened through the
// in-memory backend exactly as the registry backend opens a row.

import fs from 'fs';
import path from 'path';
import { _resetStateKinds, registerStateKind, openState, openStateRow, readStateVersion } from '@/lib/stateVersion';
import {
  PETRO_PROJECT_KIND, PETRO_PROJECT_VERSION, petroProjectKindSpec, makeMigrateV1,
  migrationStatusLine, applyDeliberateNone, provenanceOf, stripTransient,
} from '../services/projectState';
import { DEFAULT_PARAMS, computeWell } from '../engine/pipeline';
import { buildDefaultLayouts, activeTemplate } from '../layout/layoutSchema';
import { resolveTracks } from '../layout/resolveTracks';
import typewell from '../../../../../packages/engines/test-data/petrophysics/typewell.json';

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'pre-pt9a-interpretation.json'), 'utf8'));

beforeEach(() => {
  _resetStateKinds();
  registerStateKind(PETRO_PROJECT_KIND, petroProjectKindSpec);
});

describe('petro-project version 2 migration', () => {
  test('the kind is at version 2 and the code default is Timur', () => {
    expect(PETRO_PROJECT_VERSION).toBe(2);
    expect(DEFAULT_PARAMS.permMethod).toBe('timur');
  });

  test('a v1 row storing none opens as timur, stamped v2, with a provenance entry and a status line', () => {
    const { row, migrated, from } = openState(PETRO_PROJECT_KIND, fixture);
    expect(from).toBe(1);
    expect(migrated).toBe(true);
    expect(readStateVersion(row)).toBe(2);
    expect(row.params.permMethod).toBe('timur');
    // every other parameter is untouched
    const { permMethod: _p, ...restIn } = fixture.params;
    const { permMethod: _q, ...restOut } = row.params;
    expect(restOut).toEqual(restIn);
    // provenance: date, key, old value, new value
    const prov = provenanceOf(row);
    expect(prov).toHaveLength(1);
    expect(prov[0]).toMatchObject({ kind: 'model-default-migration', key: 'permMethod', from: 'none', to: 'timur' });
    expect(prov[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(prov[0].note).toMatch(/Permeability model was none .* Timur applied/);
    // the per-well facies beside it survive
    expect(row.facies['well-1']).toEqual([]);
    // the one-time status line
    expect(migrationStatusLine(row)).toBe(
      'Permeability model was off in this saved interpretation; Timur applied (owner rule: permeability is never off by default). '
      + 'Set it back to none in Parameters, Permeability if that was deliberate.',
    );
    // the fixture itself is not mutated
    expect(fixture.params.permMethod).toBe('none');
  });

  test('a v2 row storing none stays none and carries no status line', () => {
    const row = { ...fixture, schema_version: 2 };
    const out = openState(PETRO_PROJECT_KIND, row);
    expect(out.migrated).toBe(false);
    expect(out.row.params.permMethod).toBe('none');
    expect(migrationStatusLine(out.row)).toBeNull();
    expect(provenanceOf(out.row)).toEqual([]);
  });

  test('a v1 row with any other permeability model is untouched apart from the stamp', () => {
    const row = { ...fixture, params: { ...fixture.params, permMethod: 'coates' } };
    const out = openStateRow(PETRO_PROJECT_KIND, row);
    expect(out.params).toEqual(row.params);
    expect(out._migration).toBeUndefined();
    expect(provenanceOf(out)).toEqual([]);
    expect(migrationStatusLine(out)).toBeNull();
  });

  test('a v1 row flagged deliberateNone is skipped', () => {
    const row = { ...fixture, params: { ...fixture.params, deliberateNone: { permMethod: true } } };
    const out = openStateRow(PETRO_PROJECT_KIND, row);
    expect(out.params.permMethod).toBe('none');
    expect(migrationStatusLine(out)).toBeNull();
  });

  test('temperature: none is the code default today, so nothing migrates; an injected default proves the path', () => {
    expect(DEFAULT_PARAMS.tempMode).toBe('none');
    const today = makeMigrateV1({ now: () => new Date('2026-09-09T18:00:00Z') })(fixture);
    expect(today.params.tempMode).toBe('none');
    expect(today._migration.changes.map((c) => c.key)).toEqual(['permMethod']);

    const future = makeMigrateV1({ defaults: { ...DEFAULT_PARAMS, tempMode: 'linear' }, now: () => new Date('2026-09-09T18:00:00Z') })(fixture);
    expect(future.params.tempMode).toBe('linear');
    expect(future.params.permMethod).toBe('timur');
    expect(provenanceOf(future).map((e) => [e.key, e.from, e.to, e.at])).toEqual([
      ['permMethod', 'none', 'timur', '2026-09-09T18:00:00.000Z'],
      ['tempMode', 'none', 'linear', '2026-09-09T18:00:00.000Z'],
    ]);
    expect(migrationStatusLine(future)).toBe(
      'Permeability model was off in this saved interpretation; Timur applied (owner rule: permeability is never off by default). '
      + 'Temperature model was off in this saved interpretation; linear applied. '
      + 'Set it back to none in Parameters (Permeability, Temperature) if that was deliberate.',
    );
    // and the flag protects the temperature key alone
    const flagged = makeMigrateV1({ defaults: { ...DEFAULT_PARAMS, tempMode: 'linear' } })({ ...fixture, params: { ...fixture.params, deliberateNone: { tempMode: true } } });
    expect(flagged.params.tempMode).toBe('none');
    expect(flagged.params.permMethod).toBe('timur');
  });

  test('the migrator tolerates rows without params or facies', () => {
    expect(openStateRow(PETRO_PROJECT_KIND, { id: 'x' })).toMatchObject({ id: 'x', schema_version: 2 });
    const out = openStateRow(PETRO_PROJECT_KIND, { id: 'y', params: { permMethod: 'none' } });
    expect(out.params.permMethod).toBe('timur');
    expect(provenanceOf(out)).toHaveLength(1);
  });
});

describe('deliberateNone: a chosen none is remembered, and reversible', () => {
  test('moving a model to none sets the flag; a model clears it; a default none is never mistaken for a choice', () => {
    const none = applyDeliberateNone({ ...DEFAULT_PARAMS, permMethod: 'none' }, DEFAULT_PARAMS);
    expect(none.deliberateNone).toEqual({ permMethod: true });
    // re-applying other parameters keeps the flag
    const again = applyDeliberateNone({ ...none, rw: 0.06 }, none);
    expect(again.deliberateNone).toEqual({ permMethod: true });
    const back = applyDeliberateNone({ ...again, permMethod: 'timur' }, again);
    expect(back.deliberateNone).toBeUndefined();
    // tempMode is none by default: applying the defaults flags nothing
    expect(applyDeliberateNone(DEFAULT_PARAMS, DEFAULT_PARAMS)).toEqual(DEFAULT_PARAMS);
    // but moving temperature from linear back to none is a choice
    const temp = applyDeliberateNone({ ...DEFAULT_PARAMS, tempMode: 'none' }, { ...DEFAULT_PARAMS, tempMode: 'linear' });
    expect(temp.deliberateNone).toEqual({ tempMode: true });
    // with no previous set, none is taken as the choice it reads as
    expect(applyDeliberateNone({ ...DEFAULT_PARAMS, permMethod: 'none' }).deliberateNone).toEqual({ permMethod: true, tempMode: true });
  });

  test('the reversal round-trips: migrate, set none back in the UI, save at v2, reopen keeps none', () => {
    const opened = openStateRow(PETRO_PROJECT_KIND, fixture);
    expect(opened.params.permMethod).toBe('timur');
    const reverted = applyDeliberateNone({ ...opened.params, permMethod: 'none' }, opened.params);
    expect(reverted.deliberateNone).toEqual({ permMethod: true });
    const saved = { ...stripTransient(opened), params: reverted, schema_version: 2 };
    const reopened = openStateRow(PETRO_PROJECT_KIND, saved);
    expect(reopened.params.permMethod).toBe('none');
    expect(migrationStatusLine(reopened)).toBeNull();
    // even a future re-migration from v1 would honour it
    expect(makeMigrateV1()({ ...saved, schema_version: undefined }).params.permMethod).toBe('none');
  });
});

describe('regression fixture: a pre-PT9a interpretation opened through the in-memory backend', () => {
  test('the k track resolves, the status line is present and the provenance entry exists', async () => {
    // seed the backend's store with the row as the testers saved it
    window.sessionStorage.setItem('petro.dev.project.v1', JSON.stringify([fixture]));
    const { makeInMemoryBackend } = await import('../services/inMemoryBackend');
    const b = makeInMemoryBackend();
    const project = await b.loadProject();
    expect(project.id).toBe('project-pre-pt9a');
    expect(project.params.permMethod).toBe('timur');
    expect(migrationStatusLine(project)).toMatch(/Timur applied/);
    expect(provenanceOf(project)[0]).toMatchObject({ key: 'permMethod', from: 'none', to: 'timur' });

    // the workstation merges stored params over the defaults, runs the
    // pipeline and resolves the default template: k is back
    const params = { ...DEFAULT_PARAMS, ...project.params };
    const curves = Object.fromEntries(Object.entries(typewell.curves).map(([k, v]) => [k, Float64Array.from(v, (x) => (x === null ? NaN : x))]));
    const { outputs } = computeWell(curves, params);
    expect(outputs.KPERM).toBeTruthy();
    const tracks = resolveTracks(activeTemplate(buildDefaultLayouts()), { curves, outputs, logs: {}, params, keepUnresolved: true });
    const k = tracks.find((t) => t.key === 't-kperm');
    expect(k).toBeTruthy();
    expect(k.curves).toHaveLength(1);
    expect(k.note).toBeUndefined();

    // the same row with the stored none (as the testers saw it) has no k
    // curve, and under PT10a the track is kept with the reason
    const stale = { ...DEFAULT_PARAMS, ...fixture.params };
    const staleOut = computeWell(curves, stale).outputs;
    expect(staleOut.KPERM).toBeUndefined();
    const staleTracks = resolveTracks(activeTemplate(buildDefaultLayouts()), { curves, outputs: staleOut, logs: {}, params: stale, keepUnresolved: true });
    const kStale = staleTracks.find((t) => t.key === 't-kperm');
    expect(kStale.curves).toEqual([]);
    expect(kStale.note).toBe('k not computed: permeability model is none (Parameters, Permeability)');

    // saving stamps the row at v2, so the next open does not migrate again
    const saved = await b.saveProject({ params: project.params, facies: project.facies }, project.id);
    expect(saved.schema_version).toBe(2);
    const again = await b.openProject(project.id);
    expect(again.params.permMethod).toBe('timur');
    expect(migrationStatusLine(again)).toBeNull();
    expect(provenanceOf(again)).toHaveLength(1);
    window.sessionStorage.clear();
  });
});
