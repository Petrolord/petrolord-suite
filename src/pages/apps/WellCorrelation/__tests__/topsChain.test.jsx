/**
 * AppUpgrade WC-U1 PL2 + PL9, the tops chain: tops files as Petrel, Kingdom
 * and Petra write them go through the Suite's tops door (Well Data Manager's
 * tops sheet paste, planPasteText: exactly what the sheet runs) into the
 * registry, and Well Correlation's section assembly (useSectionWells, shared
 * with Stratigraphy Studio) reads them back at the right depth.
 *
 *  WC-U1-016 a column headed "Depth (TVDSS m)" was read as MD (IDU 9 went in
 *            28 m high, its KB), and a Petra export (FMNAME, DEPTH) was
 *            refused with no way to map its columns.
 * Negative control: with pasteMapping / planPasteText as on origin/main the
 * TVDSS file is planned as two creates and the Petra file errors.
 */
import fs from 'fs';
import path from 'path';
import { renderHook, waitFor } from '@testing-library/react';
import { planPasteText } from '@/pages/apps/WellDataManager/components/TopsSheetView';
import { sheetRows } from '@/pages/apps/WellDataManager/engine/topsSheet';
import { useSectionWells } from '@/components/wells/section/useSectionWells';
import { depthOfFor } from '@/components/wells/section/sectionFrame';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

const HOSTILE = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'wc', 'hostile');
const read = (f) => fs.readFileSync(path.join(HOSTILE, f), 'utf8');
const FT = 0.3048;

async function door(backend, file, unit = 'm') {
  const wells = await backend.listWells();
  const tops = (await Promise.all(wells.map((w) => backend.listTops(w.id)))).flat();
  const plan = planPasteText(read(file), { wells, rows: sheetRows(wells, tops), unit });
  if (!plan.error) {
    for (const c of plan.creates) await backend.saveTop(c.wellId, { name: c.name, mdM: c.mdM });
    for (const u of plan.updates) await backend.updateTop(u.topId, { mdM: u.mdM });
  }
  return plan;
}
const topOf = async (b, id, name) => (await b.listTops(id)).find((t) => t.name === name);

let b;
beforeAll(async () => {
  b = makeInMemoryBackend({ sample: false, seedWells: JSON.parse(read('wells.json')) });
});

test('Petrel well tops export in feet: MD converted at the door, an existing top moved', async () => {
  const plan = await door(b, 'tops_petrel_wells_ft.txt');
  expect(plan.mdUnit).toBe('ft');
  expect((await topOf(b, 'hw-utm', 'Sand D')).md_m).toBeCloseTo(Number((1990 / FT).toFixed(1)) * FT, 9);
  expect((await topOf(b, 'hw-utm', 'Top Agbada')).md_m).toBeCloseTo(1874, 1);
});

test('Kingdom export (UWI without dashes, upper-case names): matched and merged, no case twin in a well', async () => {
  const plan = await door(b, 'tops_kingdom_export.csv');
  expect(plan.problems).toEqual([]);
  expect(plan.creates).toEqual([]); // SAND D is the Sand D already there
  const names = (await b.listTops('hw-nosurvey')).map((t) => t.name.toLowerCase());
  expect(names.filter((n) => n === 'sand d')).toHaveLength(1);
});

test('Petra export (FMNAME, DEPTH with no unit): columns found, read in the unit the user picked', async () => {
  const plan = await door(b, 'tops_petra_export.txt', 'ft');
  expect(plan.error).toBeUndefined();
  expect(plan.creates.map((c) => c.name)).toEqual(['Sand E', 'Sand E']);
  expect((await topOf(b, 'hw-utm', 'Sand E')).md_m).toBeCloseTo(Number((2010 / FT).toFixed(1)) * FT, 9);
});

test('a TVDSS depth column is refused with the reason; nothing is written', async () => {
  const plan = await door(b, 'tops_tvdss_only.csv');
  expect(plan.error).toMatch(/is TVDSS\. Tops are stored in MD/);
  expect(await topOf(b, 'hw-nosurvey', 'Sand F')).toBeUndefined();
});

test('an elevation-only file is refused naming the elevation', async () => {
  const plan = await door(b, 'tops_elevation_z.csv');
  expect(plan.error).toMatch(/elevation/);
});

test('odd column order and base-before-top rows: read by header, only the changed top moves', async () => {
  const plan = await door(b, 'tops_odd_order.csv');
  expect(plan.updates.map((u) => `${u.name}@${u.mdM}`)).toEqual(['Top Akata@2040']);
  expect(plan.unchanged).toBe(2);
});

test('a duplicate line (case twin) is reported, the first is used', async () => {
  const plan = await door(b, 'tops_duplicates.csv');
  expect(plan.problems).toEqual([{ line: 2, reason: 'SAND G in IDU 9 also appears on line 1; only the first is used' }]);
});

test('the section reads the tops back where the door put them, in MD and TVDSS', async () => {
  const { result } = renderHook(() => useSectionWells(b, { deepLinkWells: ['hw-utm', 'hw-nosurvey'] }));
  await waitFor(() => expect(result.current.sectionWells).toHaveLength(2), { timeout: 8000 });
  const idu9 = result.current.sectionWells.find((w) => w.name === 'IDU 9');
  const sandD = idu9.tops.find((t) => t.name === 'Sand D');
  expect(sandD.md_m).toBeCloseTo(Number((1994 / FT).toFixed(1)) * FT, 9);
  // IDU 9: no survey, KB 28 m: TVDSS = MD - 28
  expect(depthOfFor(idu9, 'tvdss')(sandD.md_m)).toBeCloseTo(sandD.md_m - 28, 9);
  expect(result.current.topNames).toEqual(expect.arrayContaining(['Top Agbada', 'Sand D', 'Sand E', 'Sand G']));
  expect(result.current.topNames).not.toContain('Sand F');
});
