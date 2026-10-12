/**
 * Replace grid from a file (2026-10-12): a map re-made elsewhere after a new
 * well replaces the registry surface in place. The row keeps its id (so
 * ReservoirCalc Pro's "Registry source changed" notice and Earth Modeling
 * stacks follow it), the frame it replaced goes on the history, and the old
 * grid is archived for Restore. Runs the shipped service and dialog on the
 * in-memory backend.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { writeZMAP } from '@/lib/gridding/surfaceExport';
import { readSurfaceFile } from '../services/surfaceFileDoor';
import { planImport } from '../services/importPlan';
import { replaceFromFilePlan, replacementHistory } from '../services/replaceInPlace';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import SurfaceImportDialog from '../components/SurfaceImportDialog';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const SPEC = { x0: 400400, y0: 520800, dx: 100, dy: 100, nx: 4, ny: 3 };
const zmap = (shift) => writeZMAP({
  x: [0, 1, 2, 3].map((i) => SPEC.x0 + i * SPEC.dx), y: [0, 1, 2].map((r) => SPEC.y0 + r * SPEC.dy),
  z: Float32Array.from({ length: 12 }, (_, i) => -1540 - i - shift), nx: 4, ny: 3, dx: 100, dy: 100, name: 'EKENE_SAND_TOP', crsLabel: 'EPSG:32632',
});
const planFor = (text, opts = {}) => planImport({ g: readSurfaceFile(text).g, fileName: 'top-7wells.zmap', domain: 'depth', zUnit: 'm', ...opts });

async function seeded() {
  const b = makeInMemoryBackend();
  const p = planFor(zmap(0));
  const saved = await b.saveSurface({ name: 'Ekene Sand top (6-well map)', kind: p.kind, spec: p.spec, grid: p.grid, zDomain: 'depth', zUnit: 'm', provenance: p.provenance });
  return { b, saved: (await b.listSurfaces()).find((s) => s.id === saved.id) };
}

test('the surface keeps its id and name, takes the new grid, records the old frame and archives the old grid', async () => {
  const { b, saved } = await seeded();
  const before = Array.from(await b.downloadSurfaceGrid(saved));
  const out = await replaceFromFilePlan(b, saved, planFor(zmap(5.67)), { fileName: 'top-7wells.zmap' });
  expect(out.id).toBe(saved.id);
  expect(out.name).toBe('Ekene Sand top (6-well map)');
  const after = Array.from(await b.downloadSurfaceGrid(out));
  expect(after[0]).toBeCloseTo(before[0] - 5.67, 3);
  const h = out.provenance.history;
  expect(h).toHaveLength(1);
  expect(h[0]).toMatchObject({ replaced_by: 'file', file_name: 'top-7wells.zmap', previous: { nx: 4, ny: 3, z_domain: 'depth' } });
  expect(Array.from(await b.downloadArchivedGrid(h[0].archive_path, { nx: 4, ny: 3 }))).toEqual(before);
});

test('a file of another domain, and a surface shared read-only, are refused', async () => {
  const { b, saved } = await seeded();
  await expect(replaceFromFilePlan(b, saved, planFor(zmap(0), { domain: 'time' }))).rejects.toThrow(/holds depth, and this file was read as two-way time/);
  const teammate = (await b.listSurfaces()).find((s) => !s.is_own);
  await expect(replaceFromFilePlan(b, teammate, planFor(zmap(0)))).rejects.toThrow(/read-only/);
});

test('replacementHistory appends to an existing history (re-grid in place uses the same entry)', () => {
  const h = replacementHistory({ nx: 2, ny: 2, dx: 1, dy: 1, origin_x: 0, origin_y: 0, z_domain: 'depth', kind: 'structure', provenance: { history: [{ previous: { nx: 9 } }], cell_m: 100 } });
  expect(h).toHaveLength(2);
  expect(h[1].previous).toMatchObject({ nx: 2, cell_m: 100 });
});

test('the import dialog in replace mode replaces the chosen surface in place', async () => {
  const { b, saved } = await seeded();
  const onImported = jest.fn();
  render(<SurfaceImportDialog open onOpenChange={() => {}} backend={b} depthUnit="ft" onImported={onImported} replaceTarget={saved} />);
  expect(screen.getByText('Replace Ekene Sand top (6-well map) from a file')).toBeTruthy();
  expect(screen.queryByTestId('map-import-name')).toBeNull();
  const file = new File([zmap(5.67)], 'top-7wells.zmap', { type: 'text/plain' });
  file.text = () => Promise.resolve(zmap(5.67));
  fireEvent.change(screen.getByTestId('map-import-file'), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByTestId('map-import-preview').textContent).toMatch(/4×3 nodes/));
  fireEvent.click(screen.getByTestId('map-import-run'));
  await waitFor(() => expect(onImported).toHaveBeenCalled());
  const [row, , flags] = onImported.mock.calls[0];
  expect(flags).toEqual({ replaced: true });
  expect(row.id).toBe(saved.id);
  expect((await b.listSurfaces()).filter((s) => s.name === 'Ekene Sand top (6-well map)')).toHaveLength(1);
});
