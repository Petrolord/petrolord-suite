/** PT11d: the Mineral model dialog: picks, endpoint edits with reset, the problem line, Run, summary, apply and publish gating. */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MineralModelDialog from '../components/MineralModelDialog';
import { defaultMineralModel, runMineralModel, MINERAL_UNSUITED } from '../services/mineralModel';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { mapLogs } from '../services/curveMap';

async function openWell(backend) {
  const well = (await backend.listWells()).find((w) => w.is_own);
  const logs = await backend.listLogs(well.id);
  const raw = {};
  for (const l of logs) raw[l.mnemonic] = await backend.downloadCurve(l);
  const mapped = mapLogs(logs);
  const curves = {};
  for (const [key, log] of Object.entries(mapped)) if (log) curves[key] = raw[log.mnemonic];
  return { wellId: well.id, curves, logs: raw, allLogs: logs, inventory: Object.entries(mapped).map(([key, log]) => ({ key, log })), tops: [] };
}

test('the dialog edits the table, refuses a duplicate pick, runs, and gates apply and publish on a result', async () => {
  const backend = makeInMemoryBackend();
  const wd = await openWell(backend);
  const onRun = jest.fn();
  const onApply = jest.fn();
  const onPublish = jest.fn();
  const { rerender } = render(<MineralModelDialog open onOpenChange={jest.fn()} model={null} result={null} wellData={wd} params={{ phiSource: 'density' }}
    canPublish onRun={onRun} onApply={onApply} onPublish={onPublish} onStatus={jest.fn()} />);
  expect(screen.getByTestId('petro-mineral-tools').textContent).toMatch(/RHOB mapped, NPHI mapped, PEF mapped/);
  expect(screen.getByTestId('petro-mineral-pick-0').value).toBe('quartz');
  expect(screen.queryByTestId('petro-mineral-problem')).toBeNull();
  expect(screen.getByTestId('petro-mineral-apply').disabled).toBe(true);
  expect(screen.getByTestId('petro-mineral-publish').disabled).toBe(true);
  // the not-suited words are the service's own
  for (const t of MINERAL_UNSUITED) expect(screen.getByTestId('petro-mineral-unsuited').textContent).toContain(t);
  // duplicate pick is a problem and Run is disabled
  fireEvent.change(screen.getByTestId('petro-mineral-pick-1'), { target: { value: 'quartz' } });
  expect(screen.getByTestId('petro-mineral-problem').textContent).toMatch(/must be different/);
  expect(screen.getByTestId('petro-mineral-run').disabled).toBe(true);
  fireEvent.change(screen.getByTestId('petro-mineral-pick-1'), { target: { value: 'calcite' } });
  // an endpoint edit shows a per-row reset and travels into the run
  fireEvent.change(screen.getByTestId('petro-mineral-quartz-nphi'), { target: { value: '0' } });
  expect(screen.getByTestId('petro-mineral-row-quartz').textContent).toMatch(/reset/);
  fireEvent.change(screen.getByTestId('petro-mineral-pick-2'), { target: { value: 'clay' } });
  fireEvent.click(screen.getByTestId('petro-mineral-run'));
  expect(onRun).toHaveBeenCalledTimes(1);
  const model = onRun.mock.calls[0][0];
  expect(model.minerals).toEqual(['quartz', 'calcite', 'clay']);
  expect(Number(model.endpoints.quartz.nphi)).toBe(0);
  // with a result the summary shows and apply / publish open up
  const result = runMineralModel(wd, model);
  rerender(<MineralModelDialog open onOpenChange={jest.fn()} model={model} result={result} wellData={wd} params={{ phiSource: 'mineral' }}
    canPublish onRun={onRun} onApply={onApply} onPublish={onPublish} onStatus={jest.fn()} />);
  expect(screen.getByTestId('petro-mineral-summary').textContent).toMatch(/accepted/);
  expect(screen.getByTestId('petro-mineral-dialog').textContent).toMatch(/PHIT is taken from this model/);
  fireEvent.click(screen.getByTestId('petro-mineral-apply'));
  expect(onApply).toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('petro-mineral-publish'));
  expect(onPublish).toHaveBeenCalled();
  // Reset to published restores the table
  fireEvent.click(screen.getByTestId('petro-mineral-reset'));
  expect(screen.getByTestId('petro-mineral-quartz-nphi').value).toBe(String(defaultMineralModel().endpoints.quartz.nphi));
});
