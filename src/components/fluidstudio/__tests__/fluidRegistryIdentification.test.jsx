/**
 * FLUID-U2-025: identification proposed from the wells registry; the user confirms.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { proposeFluidIdentification, applyFluidIdentification } from '@/utils/fluidstudio/registryIdentification';
import FluidRegistryProposal from '@/components/fluidstudio/FluidRegistryProposal';

const WELL = { id: 'w1', name: 'Ekene-7', uwi: 'NG-OML143-007' };
const ZONES = [{ id: 'z1', name: 'E-2000 sand', top_md_m: 3000, base_md_m: 3025.2 }];

describe('the proposal', () => {
  it('well with its identifier, the zone, and the depth of the zone with its reference', () => {
    const p = proposeFluidIdentification({ well: WELL, zones: ZONES, zoneId: 'z1', identification: { well: '' } });
    expect(p.rows.map((r) => [r.key, r.value])).toEqual([
      ['well', 'Ekene-7 (NG-OML143-007)'],
      ['reservoir', 'E-2000 sand'],
      ['sampleDepth', 'E-2000 sand: 9,843 to 9,925 ft MD below the depth reference of Ekene-7'],
    ]);
  });
  it('nothing changes until applied, and only what is ticked; the registry well is remembered', () => {
    const before = { well: 'typed', reservoir: '' };
    const p = proposeFluidIdentification({ well: WELL, zones: ZONES, zoneId: 'z1', identification: before });
    expect(before).toEqual({ well: 'typed', reservoir: '' });
    const after = applyFluidIdentification(before, p, { well: false, reservoir: true });
    expect(after.well).toBe('typed');
    expect(after.reservoir).toBe('E-2000 sand');
    expect(after.registryWellId).toBe('w1');
    // a value already set is not proposed again
    expect(proposeFluidIdentification({ well: WELL, identification: { well: 'Ekene-7 (NG-OML143-007)' } }).rows[0].same).toBe(true);
    expect(proposeFluidIdentification({ well: null })).toBeNull();
  });
});

describe('on the Report tab', () => {
  it('lists the registry wells, proposes, and applies only on confirm', async () => {
    const registry = { listWells: jest.fn(async () => [WELL]), listZones: jest.fn(async () => ZONES) };
    const applied = [];
    render(<FluidRegistryProposal identification={{}} onApply={(c) => applied.push(...c)} registry={registry} />);
    fireEvent.click(screen.getByText('Propose from the wells registry'));
    await waitFor(() => expect(registry.listWells).toHaveBeenCalled());
    expect(applied).toEqual([]);
  });
  it('an empty registry says so', async () => {
    const registry = { listWells: async () => [], listZones: async () => [] };
    render(<FluidRegistryProposal identification={{}} onApply={() => {}} registry={registry} />);
    fireEvent.click(screen.getByText('Propose from the wells registry'));
    await waitFor(() => expect(screen.getByTestId('fluid-registry-empty').textContent).toMatch(/holds no wells you can see/));
  });
});
