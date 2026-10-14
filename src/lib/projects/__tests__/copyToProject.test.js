/**
 * Suite Projects P3: Copy to project runs the .pld round trip in memory into
 * the TARGET project, and refuses seismic (moved, never copied).
 */
import { copyToProject, isCopyable } from '@/lib/projects/copyToProject';

jest.mock('@/lib/portability/supabaseSource', () => ({ makeSupabaseSource: jest.fn(() => ({ src: true })) }));
jest.mock('@/lib/portability/exportPackage', () => ({ buildGeosciencePackage: jest.fn() }));
jest.mock('@/lib/portability/supabaseSink', () => ({ makeSupabaseSink: jest.fn() }));
jest.mock('@/lib/portability/importPackage', () => ({ importPackage: jest.fn() }));

test('wells are packaged and imported into the target project', async () => {
  const build = jest.fn(async () => ({ writer: { toUint8Array: async () => new Uint8Array([1, 2, 3]) } }));
  const makeSink = jest.fn((opts) => ({ opts }));
  const importer = jest.fn(async () => ({ plan: { planned: { geo_wells: [{}, {}] }, notes: ['WELL-1 imported as WELL-1 (imported)'] }, summary: {} }));
  const res = await copyToProject({
    table: 'geo_wells', ids: ['w1', 'w2'], target: { id: 'pb', name: 'OML 42' }, sourceName: 'Default', deps: { build, makeSink, importer },
  });
  expect(build.mock.calls[0][1]).toEqual([{ kind: 'well', id: 'w1' }, { kind: 'well', id: 'w2' }]);
  expect(build.mock.calls[0][2]).toMatchObject({ name: 'Copy from Default to OML 42', includeInterpretations: false });
  expect(makeSink).toHaveBeenCalledWith({ projectId: 'pb' });
  expect(importer.mock.calls[0][0]).toEqual(new Uint8Array([1, 2, 3]));
  expect(res.copied).toBe(2);
  expect(res.notes[0]).toMatch(/imported/);
});

test('seismic is moved, never copied', async () => {
  expect(isCopyable('seismic_volumes')).toBe(false);
  await expect(copyToProject({ table: 'seismic_volumes', ids: ['v'], target: { id: 'x', name: 'X' } })).rejects.toThrow(/Move seismic/);
});
