// Suite unit profile, phase 1 adoption for the project apps: Well Test,
// Nodal and ReservoirCalc Pro start a NEW workspace in the profile's
// system; an opened project keeps its own; a hand-picked system wins.
// Without a provider each app keeps its old default (negative control).
import React from 'react';
import { render, act, waitFor } from '@testing-library/react';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }), eq: jest.fn(() => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) })) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import { StaticUnitProfileProvider } from '../UnitProfileContext';
import { makeProfile } from '../presets';
import { WellTestStudioProvider, useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { NodalAnalysisStudioProvider, useNodalStudio } from '@/contexts/NodalAnalysisStudioContext';
import { ReservoirCalcProvider, useReservoirCalc } from '@/pages/apps/ReservoirCalcPro/contexts/ReservoirCalcContext';

const METRIC = { organization: makeProfile('metric') };
const OILFIELD = { organization: makeProfile('oilfield') };

function probe(useCtx) {
  const ref = { current: null };
  const Probe = () => { ref.current = useCtx(); return null; };
  return { ref, Probe };
}

describe('Well Test', () => {
  test('a new workspace starts in SI under a metric profile, oilfield under oilfield', async () => {
    const a = probe(useWellTestStudio);
    render(<StaticUnitProfileProvider layers={METRIC}><WellTestStudioProvider><a.Probe /></WellTestStudioProvider></StaticUnitProfileProvider>);
    await waitFor(() => expect(a.ref.current.unitSystem).toBe('si'));
    expect(a.ref.current.profileUnitSystem).toBe('si');
    const b = probe(useWellTestStudio);
    render(<StaticUnitProfileProvider layers={OILFIELD}><WellTestStudioProvider><b.Probe /></WellTestStudioProvider></StaticUnitProfileProvider>);
    await waitFor(() => expect(b.ref.current.unitSystem).toBe('oilfield'));
  });
  test('a hand-picked system wins over a later profile change', async () => {
    const a = probe(useWellTestStudio);
    const tree = (layers) => <StaticUnitProfileProvider layers={layers}><WellTestStudioProvider><a.Probe /></WellTestStudioProvider></StaticUnitProfileProvider>;
    const { rerender } = render(tree(METRIC));
    await waitFor(() => expect(a.ref.current.unitSystem).toBe('si'));
    act(() => a.ref.current.setUnitSystem('oilfield'));
    rerender(tree({ organization: makeProfile('metric', { depth: 'm' }) }));
    expect(a.ref.current.unitSystem).toBe('oilfield');
  });
  test('inputs typed before the profile resolves are kept (the system is display only)', async () => {
    const a = probe(useWellTestStudio);
    const tree = (layers) => <StaticUnitProfileProvider layers={layers}><WellTestStudioProvider><a.Probe /></WellTestStudioProvider></StaticUnitProfileProvider>;
    const { rerender } = render(tree(null));
    act(() => a.ref.current.setReservoirField('h', '77'));
    rerender(tree(METRIC));
    await waitFor(() => expect(a.ref.current.unitSystem).toBe('si'));
    expect(a.ref.current.reservoirInputs.h).toBe('77');
  });
  test('negative control: no provider keeps the old oilfield default', () => {
    const a = probe(useWellTestStudio);
    render(<WellTestStudioProvider><a.Probe /></WellTestStudioProvider>);
    expect(a.ref.current.unitSystem).toBe('oilfield');
    expect(a.ref.current.profileUnitSystem).toBeNull();
  });
});

describe('Nodal', () => {
  test('a new workspace follows the profile; no provider keeps oilfield', async () => {
    const a = probe(useNodalStudio);
    render(<StaticUnitProfileProvider layers={METRIC}><NodalAnalysisStudioProvider><a.Probe /></NodalAnalysisStudioProvider></StaticUnitProfileProvider>);
    await waitFor(() => expect(a.ref.current.unitSystem).toBe('si'));
    const b = probe(useNodalStudio);
    render(<NodalAnalysisStudioProvider><b.Probe /></NodalAnalysisStudioProvider>);
    expect(b.ref.current.unitSystem).toBe('oilfield');
  });
});

describe('ReservoirCalc Pro', () => {
  const backend = {
    listProjects: async () => [], getDepthUnit: async () => null,
  };
  test('a blank workspace takes metric under a metric profile and stays clean', async () => {
    const a = probe(useReservoirCalc);
    render(<StaticUnitProfileProvider layers={METRIC}><ReservoirCalcProvider backend={backend}><a.Probe /></ReservoirCalcProvider></StaticUnitProfileProvider>);
    await waitFor(() => expect(a.ref.current.state.unitSystem).toBe('metric'));
    expect(a.ref.current.state.isDirty).toBeFalsy();
    expect(a.ref.current.profileUnitSystem).toBe('metric');
    // the conversion ran: the default area is now in metric display terms
    expect(a.ref.current.state.inputUnits).toBeTruthy();
  });
  test('a touched workspace or an opened project is never re-adopted', async () => {
    const a = probe(useReservoirCalc);
    render(<StaticUnitProfileProvider layers={METRIC}><ReservoirCalcProvider backend={backend}><a.Probe /></ReservoirCalcProvider></StaticUnitProfileProvider>);
    await waitFor(() => expect(a.ref.current.state.unitSystem).toBe('metric'));
    act(() => a.ref.current.dispatch({ type: 'UPDATE_INPUTS', payload: { area: '1234' } }));
    act(() => a.ref.current.dispatch({ type: 'ADOPT_UNIT_SYSTEM', payload: 'field' }));
    expect(a.ref.current.state.unitSystem).toBe('metric'); // touched: refused
    const b = probe(useReservoirCalc);
    render(<StaticUnitProfileProvider layers={METRIC}><ReservoirCalcProvider backend={backend}><b.Probe /></ReservoirCalcProvider></StaticUnitProfileProvider>);
    await waitFor(() => expect(b.ref.current.state.unitSystem).toBe('metric'));
    // a saved field project opened under a metric profile stays field
    act(() => b.ref.current.dispatch({ type: 'LOAD_PROJECT', payload: { id: 'p1', name: 'Saved', unitSystem: 'field', inputs: { deterministic: {} } } }));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(b.ref.current.state.project.id).toBe('p1');
    expect(b.ref.current.state.unitSystem).toBe('field');
  });
  test('a hand-picked system wins; a new project starts from the profile again', async () => {
    const a = probe(useReservoirCalc);
    render(<StaticUnitProfileProvider layers={METRIC}><ReservoirCalcProvider backend={backend}><a.Probe /></ReservoirCalcProvider></StaticUnitProfileProvider>);
    await waitFor(() => expect(a.ref.current.state.unitSystem).toBe('metric'));
    act(() => a.ref.current.setUnitSystem('field'));
    expect(a.ref.current.state.unitSystem).toBe('field');
    act(() => a.ref.current.createNewProject());
    await waitFor(() => expect(a.ref.current.state.unitSystem).toBe('metric'));
  });
  test('negative control: no provider keeps field', () => {
    const a = probe(useReservoirCalc);
    render(<ReservoirCalcProvider backend={backend}><a.Probe /></ReservoirCalcProvider>);
    expect(a.ref.current.state.unitSystem).toBe('field');
  });
});
