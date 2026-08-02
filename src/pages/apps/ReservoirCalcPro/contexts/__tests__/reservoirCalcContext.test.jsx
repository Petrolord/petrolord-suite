// Multi-reservoir workspace behaviour: one project holds several reservoir
// cases; switching folds the live workspace into its entry so revisiting a
// reservoir restores its inputs and results.
import React from 'react';
import { renderHook, act } from '@testing-library/react';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: jest.fn() } }));

import { ReservoirCalcProvider, useReservoirCalc } from '../ReservoirCalcContext';

const wrapper = ({ children }) => <ReservoirCalcProvider>{children}</ReservoirCalcProvider>;

const setup = () => renderHook(() => useReservoirCalc(), { wrapper });

describe('multi-reservoir cases', () => {
    it('addReservoir folds the current workspace into an entry and opens a blank case', () => {
        const { result } = setup();
        act(() => {
            result.current.updateInputs({ area: 1234 });
            result.current.setResults({ stooip: 42 });
        });
        act(() => result.current.addReservoir('Zone B'));

        const { state } = result.current;
        expect(state.reservoirs).toHaveLength(2);
        expect(state.reservoirs[0].name).toBe('Reservoir 1');
        expect(state.reservoirs[0].inputs.area).toBe(1234);
        expect(state.reservoirs[0].results).toEqual({ stooip: 42 });
        expect(state.reservoirName).toBe('Zone B');
        expect(state.activeReservoirId).toBe(state.reservoirs[1].id);
        // the new case starts fresh
        expect(state.inputs.area).toBe(5000);
        expect(state.results).toBeNull();
    });

    it('switchReservoir restores the target inputs and results, keeping the edits made meanwhile', () => {
        const { result } = setup();
        act(() => {
            result.current.updateInputs({ area: 1234 });
            result.current.setResults({ stooip: 42 });
        });
        act(() => result.current.addReservoir('Zone B'));
        act(() => {
            result.current.updateInputs({ area: 777 });
            result.current.setResults({ stooip: 7 });
        });

        const firstId = result.current.state.reservoirs[0].id;
        act(() => result.current.switchReservoir(firstId));

        expect(result.current.state.inputs.area).toBe(1234);
        expect(result.current.state.results).toEqual({ stooip: 42 });
        expect(result.current.state.reservoirName).toBe('Reservoir 1');
        // Zone B kept its own edits
        const zoneB = result.current.state.reservoirs.find(r => r.name === 'Zone B');
        expect(zoneB.inputs.area).toBe(777);
        expect(zoneB.results).toEqual({ stooip: 7 });
    });

    it('renameReservoir renames the open case even before any entry exists', () => {
        const { result } = setup();
        act(() => result.current.renameReservoir(null, 'North Flank'));
        expect(result.current.state.reservoirs).toHaveLength(1);
        expect(result.current.state.reservoirs[0].name).toBe('North Flank');
        expect(result.current.state.reservoirName).toBe('North Flank');
    });

    it('deleteReservoir on the open case falls back to the first remaining one', () => {
        const { result } = setup();
        act(() => {
            result.current.updateInputs({ area: 1234 });
        });
        act(() => result.current.addReservoir('Zone B'));
        const activeId = result.current.state.activeReservoirId;
        act(() => result.current.deleteReservoir(activeId));

        expect(result.current.state.reservoirs).toHaveLength(1);
        expect(result.current.state.reservoirName).toBe('Reservoir 1');
        expect(result.current.state.inputs.area).toBe(1234);
    });

    it('loadProject materialises a legacy single-reservoir project as one entry', () => {
        const { result } = setup();
        act(() => result.current.loadProject({
            id: 'p1',
            name: 'North Field',
            reservoirName: 'Zone A',
            inputs: { deterministic: { area: 900, fluidType: 'oil' }, surfaces: [], polygons: [] },
            results: { stooip: 9 },
            unitSystem: 'field',
        }));

        const { state } = result.current;
        expect(state.reservoirs).toHaveLength(1);
        expect(state.reservoirs[0].name).toBe('Zone A');
        expect(state.inputs.area).toBe(900);
        expect(state.results).toEqual({ stooip: 9 });
        expect(state.project.id).toBe('p1');
    });

    it('loadProject opens the active reservoir of a multi-reservoir project', () => {
        const { result } = setup();
        act(() => result.current.loadProject({
            id: 'p2',
            name: 'Two Zones',
            reservoirs: [
                { id: 'r-1', name: 'Zone A', inputs: { area: 100 }, results: { stooip: 1 } },
                { id: 'r-2', name: 'Zone B', inputs: { area: 200 }, results: { stooip: 2 } },
            ],
            activeReservoirId: 'r-2',
        }));

        const { state } = result.current;
        expect(state.reservoirs).toHaveLength(2);
        expect(state.activeReservoirId).toBe('r-2');
        expect(state.reservoirName).toBe('Zone B');
        expect(state.inputs.area).toBe(200);
        expect(state.results).toEqual({ stooip: 2 });
    });

    it('createNewProject clears the reservoir list with the saved-projects list intact', () => {
        const { result } = setup();
        act(() => result.current.addReservoir('Zone B'));
        act(() => result.current.createNewProject());
        expect(result.current.state.reservoirs).toHaveLength(0);
        expect(result.current.state.activeReservoirId).toBeNull();
        expect(result.current.state.project.id).toBeNull();
    });
});
