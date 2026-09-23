/**
 * The Tops to Horizons dialog end to end, on the engines' exact-truth
 * synthetic field: runJob runs the real pipeline in-process (the worker's
 * job), only the Supabase-backed saves and log listing are mocked. The
 * interpreter's path: tie and match, review the board, pick faults
 * automatically and keep them, track the framework with them as barriers,
 * accept, then a prognosis for a well.
 */
import React from 'react';
import {
  render, screen, fireEvent, waitFor, within,
} from '@testing-library/react';
import { buildSyntheticField } from '../engine/syntheticField';
import { runFieldMatch, runFrameworkTrack, runFaultDetect } from '../services/topsToHorizonsPipeline';
import TopsToHorizonsDialog from '../components/workspace/dialogs/TopsToHorizonsDialog';

const field = buildSyntheticField();
const savedHorizons = [];
const savedFaults = [];

jest.mock('../services/horizonsService', () => ({
  saveHorizon: jest.fn(async (args) => {
    savedHorizons.push(args);
    return { id: `h${savedHorizons.length}`, name: args.name };
  }),
}));
jest.mock('../services/faultsService', () => ({
  saveFault: jest.fn(async (args) => {
    savedFaults.push(args);
    return { id: `f${savedFaults.length}`, name: args.name, sticks: args.sticks, params: args.params };
  }),
}));
jest.mock('@/lib/stratRegistry', () => ({ listUnits: jest.fn(async () => []) }));
jest.mock('../services/wellsService', () => {
  const actual = jest.requireActual('../services/wellsService');
  return {
    ...actual,
    listLogs: jest.fn(async (wellId) => [
      { id: `${wellId}:DT`, mnemonic: 'DT', start_md_m: 0, step_m: 0.5 },
      { id: `${wellId}:RHOB`, mnemonic: 'RHOB', start_md_m: 0, step_m: 0.5 },
    ]),
    downloadCurve: jest.fn(async (log) => {
      // eslint-disable-next-line global-require
      const { buildSyntheticField: build } = require('../engine/syntheticField');
      const f = build();
      const [wellId, kind] = log.id.split(':');
      const w = f.wells[Number(wellId.slice(1))];
      return Float32Array.from(kind === 'DT' ? w.logs.dtUsPerM : w.logs.rho);
    }),
  };
});

const manifest = { geometry: { dt_us: field.dtUs } };
const volume = { id: 'vol', storage_path: 'u/vol' };
const viewerWells = field.wells.map((w, i) => ({
  id: `w${i}`,
  name: w.name,
  surfaceX: w.surfaceX,
  surfaceY: w.surfaceY,
  kbM: w.kbM,
  tops: w.tops.map((t) => ({ name: t.name, md: t.md })),
  checkshots: w.checkshots,
  checkshots_derived: null,
  deviation: w.deviation,
  path: [{ md: 0 }, { md: w.tdMdM }],
}));

const runJob = (type, config, onProgress) => {
  const args = { ...config, getTrace: field.getTrace, onProgress };
  const promise = type === 'match' ? runFieldMatch(args)
    : type === 'track' ? runFrameworkTrack(args) : runFaultDetect(args);
  return { promise, cancel: () => {} };
};

test('from well tops to saved, named horizons with automatic faults', async () => {
  const onHorizonsSaved = jest.fn(async () => {});
  const onFaultsSaved = jest.fn();
  const props = {
    open: true,
    onOpenChange: () => {},
    volume,
    manifest,
    geom: field.geom,
    affine: field.affine,
    wells: viewerWells,
    horizons: [{ name: 'TOP_A' }],               // an existing horizon of that name
    faults: [],
    runJob,
    onHorizonsSaved,
    onFaultsSaved,
  };
  const { rerender } = render(<TopsToHorizonsDialog {...props} />);

  // 1. tie and match
  fireEvent.click(screen.getByTestId('t2h-match'));
  const board = await screen.findByTestId('t2h-board', {}, { timeout: 60000 });
  expect(board.textContent).toContain('TOP_A');
  expect(board.textContent).toContain('thin: rides on TOP_C');
  fireEvent.click(screen.getByTestId('t2h-step-wells'));
  expect(screen.getByTestId('t2h-convention').textContent).toMatch(/normal polarity, 0° phase from 5 tied wells/);

  // 2. automatic faults over the default area, kept
  fireEvent.click(screen.getByTestId('t2h-step-faults'));
  fireEvent.click(screen.getByTestId('t2h-detect'));
  await screen.findByText(/Auto-1: confidence/, {}, { timeout: 60000 });
  fireEvent.click(screen.getByText('Save the ticked faults'));
  await waitFor(() => expect(onFaultsSaved).toHaveBeenCalled());
  expect(savedFaults[0].params.source).toBe('auto');
  // the parent now lists them: they become barriers
  rerender(<TopsToHorizonsDialog {...props} faults={onFaultsSaved.mock.calls[0][0]} />);

  // 3. track the framework and accept
  fireEvent.click(screen.getByTestId('t2h-step-track'));
  fireEvent.click(screen.getByTestId('t2h-track'));
  const results = await screen.findByTestId('t2h-results', {}, { timeout: 120000 });
  expect(within(results).getByText('TOP_C2')).toBeTruthy();
  expect(within(results).getByText('on TOP_C + isochron')).toBeTruthy();
  fireEvent.click(screen.getByTestId('t2h-accept'));
  await waitFor(() => expect(onHorizonsSaved).toHaveBeenCalled());
  const names = savedHorizons.map((h) => h.name).sort();
  expect(names).toEqual(['SU', 'TOP_A (2)', 'TOP_B', 'TOP_C', 'TOP_C2', 'TOP_D', 'TOP_E']);
  expect(savedHorizons.every((h) => h.params.source === 'well_tops')).toBe(true);
  expect(screen.getByTestId('t2h-accept').textContent).toContain('Saved 7 horizons');

  // 4. prognosis for a well
  fireEvent.click(screen.getByText('Prognosis for a well'));
  fireEvent.change(screen.getByLabelText('Well'), { target: { value: 'w2' } });
  const prog = screen.getByTestId('t2h-prognosis');
  expect(prog.textContent).toContain('TOP_A');
  expect(prog.textContent).toMatch(/±/);
}, 300000);
