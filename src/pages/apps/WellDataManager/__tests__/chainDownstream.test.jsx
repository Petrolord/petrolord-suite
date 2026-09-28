/**
 * AppUpgrade PL9, the chain: a well written by Well Data Manager in the
 * state a user leaves it (a Schlumberger TDEP file logged bottom-up, a LAS
 * 3.0 file with a Tops block) is read by the REAL downstream code:
 *  - Petrophysics Studio's workstation (PetroWorkstation) selects the well
 *    and draws its tracks, where it used to report "no depth curve";
 *  - Well Correlation's section assembly (useSectionWells, shared with
 *    Stratigraphy Studio) gets an ascending depth vector aligned with GR,
 *    and the tops imported from the LAS 3.0 Tops block.
 * Negative control: with the index policy and the TDEP alias reverted
 * (git stash of lasIndex wiring + curveMap), the Petrophysics test fails on
 * "This well has no depth curve yet" and the section depth is descending.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, waitFor, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { makeInMemoryBackend as makeWdmBackend } from '../services/inMemoryBackend';
import { planMerge } from '../engine/mergeImport';
import { topsFromLasBlocks } from '../engine/lasTops';
import { makeInMemoryBackend as makePetroBackend } from '@/pages/apps/PetrophysicsStudio/services/inMemoryBackend';
import PetroWorkstation from '@/pages/apps/PetrophysicsStudio/components/PetroWorkstation';
import { useSectionWells } from '@/components/wells/section/useSectionWells';

const HOSTILE = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'wdm', 'hostile');
const file = (name) => ({ name, text: async () => fs.readFileSync(path.join(HOSTILE, name), 'utf8') });

/** What LasImportDialog does for a new well, through the backend. */
async function importNewWell(b, name, x) {
  const { meta, prep } = await b.parseLasFile(file(name));
  const well = await b.saveWell({ name: meta.suggestedHeader.name, surfaceX: x, surfaceY: 0, kbM: meta.suggestedHeader.kbM ?? 0, tdMdM: meta.suggestedHeader.tdMdM });
  const keep = Object.fromEntries(prep.logs.map((l) => [l.mnemonic, true]));
  const plan = planMerge({ prepLogs: prep.logs, keep });
  await b.saveLogs(well.id, plan.logs);
  for (const t of topsFromLasBlocks(meta.blocks || {}).tops) await b.saveTop(well.id, { name: t.name, mdM: t.md });
  return well;
}

let wdm; let slb; let l3;
beforeAll(async () => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  wdm = makeWdmBackend({ seedSharedWell: false });
  slb = await importNewWell(wdm, 'las20_slb_tdep_upward.las', 1000);
  l3 = await importNewWell(wdm, 'las30_tops_strings.las', 2000);
});

const ascending = (a) => { for (let i = 1; i < a.length; i++) if (!(a[i] > a[i - 1])) return false; return true; };
const wdmReads = () => ({
  listWells: wdm.listWells, listLogs: wdm.listLogs, downloadCurve: wdm.downloadCurve,
  listTops: wdm.listTops, listIntervals: wdm.listIntervals,
});

test('Petrophysics Studio opens the TDEP bottom-up well and draws its tracks', async () => {
  const backend = { ...makePetroBackend(), ...wdmReads(), listZones: async () => [] };
  render(<MemoryRouter><PetroWorkstation backend={backend} /></MemoryRouter>);
  const rows = await screen.findAllByTestId('petro-well-row');
  fireEvent.click(rows.find((r) => r.textContent.includes('SLB TD-3')));
  await waitFor(() => expect(screen.getByTestId('petro-status').textContent).toMatch(/Loaded 4 curves/));
  expect(screen.getByTestId('petro-status').textContent).not.toMatch(/no depth curve/);
  expect(await screen.findByTestId('petro-tracks')).toBeInTheDocument();
});

test('Well Correlation assembles both wells: ascending depth aligned with GR, LAS 3.0 tops present', async () => {
  const backend = { ...wdmReads(), loadSection: async () => null };
  const { result } = renderHook(() => useSectionWells(backend, { deepLinkWells: [slb.id, l3.id] }));
  await waitFor(() => expect(result.current.sectionWells).toHaveLength(2));
  const [a, b] = result.current.sectionWells;
  expect(a.depth).toBeTruthy();
  expect(ascending(a.depth)).toBe(true);
  expect(a.depth[0]).toBeCloseTo(7000 * 0.3048, 2);
  // the GR sample at the shallowest depth is the file's LAST data row
  const gr = (await wdm.downloadCurve((await wdm.listLogs(slb.id)).find((l) => l.mnemonic === 'GR')));
  expect(gr[0]).toBeCloseTo(60, 3); // gr(i=0) = 60 at 7000 ft, written last in the file
  expect(b.tops.map((t) => [t.name, t.md_m])).toEqual([['Upper Sand', 1501], ['Lower Shale', 1503.25]]);
  expect(result.current.topNames).toEqual(expect.arrayContaining(['Upper Sand', 'Lower Shale']));
});
