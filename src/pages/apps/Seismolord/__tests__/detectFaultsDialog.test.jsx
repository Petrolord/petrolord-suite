// Detect faults on its own (discoverability programme): the dialog starts
// with an area around the line on screen, runs the real fault picker on
// the engines' exact-truth synthetic field, and saves the ticked faults
// as automatic faults. aoiAround stays inside the sample cap.
import React from 'react';
import '@testing-library/jest-dom';
import {
  render, screen, fireEvent, waitFor,
} from '@testing-library/react';
import { buildSyntheticField } from '../engine/syntheticField';
import { runFaultDetect, aoiAround, AOI_MAX_SAMPLES } from '../services/topsToHorizonsPipeline';
import DetectFaultsDialog from '../components/workspace/dialogs/DetectFaultsDialog';

const savedFaults = [];
jest.mock('../services/faultsService', () => ({
  saveFault: jest.fn(async (args) => {
    savedFaults.push(args);
    return { id: `f${savedFaults.length}`, name: args.name, sticks: args.sticks, params: args.params };
  }),
}));

const field = buildSyntheticField();
const size = (a) => (a.il1 - a.il0 + 1) * (a.xl1 - a.xl0 + 1) * (a.s1 - a.s0 + 1);

describe('aoiAround', () => {
  test('a small survey fits whole, full time range', () => {
    const g = { nIl: 70, nXl: 60, ns: 420 };
    expect(aoiAround({ il: 10, xl: 50 }, g)).toEqual({
      il0: 0, il1: 69, xl0: 0, xl1: 59, s0: 0, s1: 419,
    });
  });

  test('a large survey: a square box centred on the line, full time, under the cap', () => {
    const g = { nIl: 2000, nXl: 1500, ns: 1500 };
    const a = aoiAround({ il: 1000, xl: 20 }, g);
    expect(a.s0).toBe(0);
    expect(a.s1).toBe(1499);
    expect(a.il1 - a.il0).toBe(a.xl1 - a.xl0);
    expect(a.xl0).toBe(0);                        // clamped at the survey edge
    expect(a.il0).toBeLessThanOrEqual(1000);
    expect(a.il1).toBeGreaterThanOrEqual(1000);
    expect(size(a)).toBeLessThanOrEqual(AOI_MAX_SAMPLES);
  });

  test('a very long trace shrinks the time window around the centre sample instead', () => {
    const g = { nIl: 500, nXl: 500, ns: 20000 };
    const a = aoiAround({ il: 250, xl: 250, s: 15000 }, g);
    expect(a.il1 - a.il0 + 1).toBe(40);
    expect(a.s0).toBeLessThanOrEqual(15000);
    expect(a.s1).toBeGreaterThanOrEqual(15000);
    expect(size(a)).toBeLessThanOrEqual(AOI_MAX_SAMPLES);
  });
});

test('Detect faults: default area, real picking on the synthetic field, ticked faults saved as automatic', async () => {
  const runJob = (type, config, onProgress) => {
    expect(type).toBe('faults');
    return { promise: runFaultDetect({ ...config, getTrace: field.getTrace, onProgress }), cancel: () => {} };
  };
  const onFaultsSaved = jest.fn();
  render(
    <DetectFaultsDialog
      open
      onOpenChange={() => {}}
      volume={{ id: 'vol' }}
      manifest={{ geometry: { dt_us: field.dtUs } }}
      geom={field.geom}
      faults={[{ id: 'x', name: 'Auto-1' }]}
      center={{ il: 35, xl: 30 }}
      runJob={runJob}
      onFaultsSaved={onFaultsSaved}
    />,
  );
  expect(screen.getByText(/no variance volume is needed first/)).toBeInTheDocument();
  expect(screen.getByTestId('sl-aoi-line')).toBeInTheDocument();
  expect(screen.getByLabelText('Inline from (il0)')).toHaveValue(0);
  fireEvent.click(screen.getByTestId('t2h-detect'));
  await screen.findByText(/Auto-1: confidence/, {}, { timeout: 60000 });
  fireEvent.click(screen.getByTestId('sl-auto-faults-save'));
  await waitFor(() => expect(onFaultsSaved).toHaveBeenCalled());
  expect(savedFaults.length).toBeGreaterThan(0);
  expect(savedFaults[0].params.source).toBe('auto');
  expect(savedFaults[0].name).toBe('Auto-1 (2)');   // the taken name is not reused
}, 120000);

test('a local (not yet uploaded) survey is refused with the reason', () => {
  render(
    <DetectFaultsDialog
      open
      onOpenChange={() => {}}
      volume={{ id: 'l', local: true }}
      manifest={{ geometry: { dt_us: 4000 } }}
      geom={field.geom}
      runJob={() => ({ promise: Promise.resolve({ faults: [] }), cancel() {} })}
    />,
  );
  expect(screen.getByText(/Start the import to convert this survey/)).toBeInTheDocument();
});
