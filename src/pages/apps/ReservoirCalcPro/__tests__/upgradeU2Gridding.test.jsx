// ReservoirCalc Pro upgrade U2-013: gridding settings saved with the
// project. Through the shipped context, backend and ProjectService.

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ReservoirCalcProvider, useReservoirCalc } from '../contexts/ReservoirCalcContext';
import { makeInMemoryRcpBackend } from '../services/rcpBackend';
import { fromRow } from '../services/ProjectService';
import { SAVED_PROJECT_ROWS } from '../services/savedFixtures';
import { effectiveGridding, cleanGridding } from '../services/griddingSettings';
import { saveSettings, DEFAULT_SETTINGS } from '../hooks/useReservoirSettings';

jest.setTimeout(120000);

const setup = (backend = makeInMemoryRcpBackend()) => {
  const wrapper = ({ children }) => <ReservoirCalcProvider backend={backend}>{children}</ReservoirCalcProvider>;
  return { backend, ...renderHook(() => useReservoirCalc(), { wrapper }) };
};
const structuralRow = () => SAVED_PROJECT_ROWS.find((f) => f.expect.structural);

afterEach(() => saveSettings({ ...DEFAULT_SETTINGS }));

describe('U2-013 the project carries its gridding', () => {
  it('the rules: a clean project record wins; otherwise the browser; malformed records are ignored', () => {
    expect(effectiveGridding({ gridResolution: 80, interpolationMethod: 'idw' }, { gridResolution: 250, interpolationMethod: 'kriging' })).toEqual({ gridResolution: 80, interpolationMethod: 'idw', source: 'project' });
    expect(effectiveGridding(null, { gridResolution: 250, interpolationMethod: 'kriging' }).source).toBe('browser');
    expect(cleanGridding({ gridResolution: 5, interpolationMethod: 'idw' })).toBeNull();
    expect(cleanGridding({ gridResolution: 100, interpolationMethod: 'spline' })).toBeNull();
  });

  it('saved on one browser, opened on another with other settings: the volume is calculated with the project\'s gridding', async () => {
    const fx = structuralRow();
    saveSettings({ ...DEFAULT_SETTINGS, gridResolution: 80, interpolationMethod: 'idw' });
    const a = setup(makeInMemoryRcpBackend({ savedRows: [fx.row] }));
    act(() => a.result.current.loadProject(fromRow(JSON.parse(JSON.stringify(fx.row)))));
    act(() => a.result.current.setCalcMethod('deterministic'));
    await act(async () => { await a.result.current.calculate(); });
    const volA = a.result.current.state.results.stooip;
    expect(a.result.current.state.results.gridding).toMatchObject({ interpolation: 'idw' });
    await act(async () => { await a.result.current.saveCurrentProject('user-dev', { name: 'Gridding test' }); });
    const savedRow = (await a.backend.projects.getProjects()).find((p) => p.id === fx.row.id);
    expect(savedRow.gridding).toEqual({ gridResolution: 80, interpolationMethod: 'idw' });

    // another browser: kriging at 250
    saveSettings({ ...DEFAULT_SETTINGS, gridResolution: 250, interpolationMethod: 'kriging' });
    const b = setup();
    act(() => b.result.current.loadProject(savedRow));
    act(() => b.result.current.setCalcMethod('deterministic'));
    await act(async () => { await b.result.current.calculate(); });
    expect(b.result.current.state.results.gridding).toMatchObject({ interpolation: 'idw', nx: expect.any(Number) });
    expect(b.result.current.state.results.stooip).toBeCloseTo(volA, 6);
  });

  it('negative control: a project saved before U2-013 follows the browser, and that changes its volume', async () => {
    const fx = structuralRow();
    const run = async (s) => {
      saveSettings({ ...DEFAULT_SETTINGS, ...s });
      const h = setup();
      act(() => h.result.current.loadProject(fromRow(JSON.parse(JSON.stringify(fx.row)))));
      expect(h.result.current.state.gridding).toBeNull();
      act(() => h.result.current.setCalcMethod('deterministic'));
      await act(async () => { await h.result.current.calculate(); });
      return h.result.current.state.results;
    };
    const coarse = await run({ gridResolution: 80, interpolationMethod: 'idw' });
    const fine = await run({ gridResolution: 250, interpolationMethod: 'idw' });
    expect(coarse.gridding.nx).not.toBe(fine.gridding.nx);
    expect(coarse.stooip).not.toBeCloseTo(fine.stooip, 0);
  });
});
