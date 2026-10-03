/**
 * SCAL-U1 on the page model: the unit profile at the doors (PL3), typing
 * that is never rewritten under the cursor (PL11), the project file as the
 * saved payload with a full round trip (RL12), an old project opening in
 * oilfield, the fit trail, and the .pld family.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ScalStudioProvider, useScalStudio } from '@/contexts/ScalStudioContext';
import ScalField from '@/components/scalstudio/ScalField';
import { SCHEMA_1_MANUAL } from '@/components/scalstudio/__fixtures__/savedProjects';
import { buildDemoSamples } from '@/components/scalstudio/demoSamples';
import { KR_CONTRACT_PAYLOAD_KEY } from '@/lib/inputProvenance/krContract';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

const wrap = (props = {}) => ({ children }) => (
  <MemoryRouter><ScalStudioProvider {...props}>{children}</ScalStudioProvider></MemoryRouter>
);

describe('units (PL3)', () => {
  it('a new workspace follows the profile; values stay in field units underneath', async () => {
    const { result } = renderHook(() => useScalStudio(), { wrapper: wrap({ profileSystem: 'si' }) });
    expect(result.current.unitSystem).toBe('si');
    expect(result.current.followsProfile).toBe(true);
    expect(result.current.u.label('pc')).toBe('kPa');
    expect(result.current.u.text('ift', '26')).toBe('26'); // dyn/cm and mN/m are equal
    expect(result.current.u.text('length', '8600')).toBe('2621.28');
    expect(result.current.capillary.reservoir.sigma_dyncm).toBe('26');
  });

  it('an old project opens in oilfield whatever the profile says', async () => {
    const { result } = renderHook(() => useScalStudio(), { wrapper: wrap({ profileSystem: 'si' }) });
    act(() => result.current.hydrateFromFile(SCHEMA_1_MANUAL));
    expect(result.current.unitSystem).toBe('oilfield');
    expect(result.current.height.fwl_tvdss).toBe('8620');
  });
});

describe('typing (PL11)', () => {
  function Harness() {
    const { height, setHeightField, setUnitSystem } = useScalStudio();
    return (
      <div>
        <button type="button" onClick={() => setUnitSystem('si')}>si</button>
        <ScalField label="FWL" kind="length" testId="fwl" value={height.fwl_tvdss} onChange={(v) => setHeightField('fwl_tvdss', v)} />
        <span data-testid="stored">{height.fwl_tvdss}</span>
      </div>
    );
  }
  it('in SI "2621." is kept as typed while the stored value is ft; a cleared field stays cleared', () => {
    render(<Harness />, { wrapper: wrap() });
    fireEvent.click(screen.getByText('si'));
    const input = screen.getByTestId('fwl');
    for (const t of ['2', '26', '262', '2621', '2621.']) fireEvent.change(input, { target: { value: t } });
    expect(input).toHaveValue('2621.');
    expect(Number(screen.getByTestId('stored').textContent)).toBeCloseTo(2621 / 0.3048, 6);
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue('');
    expect(screen.getByTestId('stored').textContent).toBe('');
    fireEvent.change(input, { target: { value: '-' } });
    expect(input).toHaveValue('-');
  });
});

describe('the fit trail and the project file (RL8, RL12)', () => {
  it('a fit applied from a sample is recorded; the file is the payload with the kr-1 block; it reads back whole', async () => {
    const { result } = renderHook(() => useScalStudio(), { wrapper: wrap({ build: 'test build' }) });
    act(() => result.current.setSamples(buildDemoSamples().map((s, i) => ({ ...s, id: `d${i}` }))));
    act(() => result.current.applyKrFitToCurves('d0'));
    expect(result.current.owStatus.kind).toBe('fitted');
    act(() => result.current.setIdentificationField('field', 'Ekene'));
    act(() => result.current.setSourceField('k_md', 'source', 'lab'));
    act(() => result.current.setUnitSystem('si'));
    const file = JSON.parse(JSON.stringify(result.current.serializeForExport()));
    expect(file.schema).toBe(2);
    expect(file[KR_CONTRACT_PAYLOAD_KEY].oil_water.origin.kind).toBe('fitted');
    expect(file[KR_CONTRACT_PAYLOAD_KEY].app_build).toBe('test build');

    const { result: other } = renderHook(() => useScalStudio(), { wrapper: wrap() });
    act(() => other.current.hydrateFromFile(file));
    expect(other.current.curves).toEqual(result.current.curves);
    expect(other.current.samples).toEqual(result.current.samples);
    expect(other.current.identification.field).toBe('Ekene');
    expect(other.current.inputMeta.k_md.source).toBe('lab');
    expect(other.current.unitSystem).toBe('si');
    expect(other.current.owStatus.kind).toBe('fitted');

    act(() => other.current.setOwField('nw', '3.3'));
    expect(other.current.owStatus.kind).toBe('edited-after-fit');
  });

  it('saved_scal_projects travels in .pld', () => {
    // eslint-disable-next-line global-require
    const src = require('fs').readFileSync(require('path').join(process.cwd(), 'src/lib/portability/familiesCore.js'), 'utf8');
    expect(src).toMatch(/'saved_scal_projects'/);
  });
});
