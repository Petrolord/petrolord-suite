// "Depth below the pick" (2026-10-13): a registry target can sit a
// stand-off below the picked top or surface, and "Refresh from source"
// keeps that stand-off.
//
// Kit check (Ekene kit v4, 07-well-design/ekene-11-targets.csv): the Oboro
// Sand top map reads 1877.36 m TVDSS at 402250 E 521750 N, and T1 Oboro Sand
// sits 8 m below it at 1885.36 m TVDSS. The tests below use a flat grid at
// that depth so the same arithmetic is checked exactly.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
const mockSurfaces = [];
const mockGrid = { value: -1877.36 };
jest.mock('@/lib/wellsRegistry', () => ({ listWellsWithTops: async () => [] }));
jest.mock('@/lib/surfacesRegistry', () => ({
  listSurfaces: async () => JSON.parse(JSON.stringify(mockSurfaces)),
  downloadSurfaceGrid: async () => new Float32Array(9).fill(mockGrid.value),
}));
const mockToast = { toast: jest.fn() }; // stable, as the real hook's is
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => mockToast }));
jest.mock('@/components/ui/select', () => {
  const R = require('react');
  const Ctx = R.createContext(null);
  return {
    Select: ({ value, onValueChange, children }) => (
      <Ctx.Provider value={{ value, onValueChange }}>{children}</Ctx.Provider>
    ),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }) => {
      const c = R.useContext(Ctx);
      return (
        <select value={c.value} onChange={(e) => c.onValueChange(e.target.value)}>
          <option value="" />
          {children}
        </select>
      );
    },
    SelectItem: ({ value, children }) => <option value={value}>{children}</option>,
  };
});

import { targetFromSurfacePick, targetFromTop, refreshTargetPatch } from '../services/targetSources';
import TargetFromRegistryDialog from '../components/TargetFromRegistryDialog';

const OBORO = {
  id: 's-oboro', name: 'WDS demo: Oboro Sand top', kind: 'structure', z_domain: 'depth', z_unit: 'm', xy_unit: 'm',
  crs: 'EPSG:32632', origin_x: 402200, origin_y: 521700, dx: 50, dy: 50, nx: 3, ny: 3, provenance: {}, updated_at: '2026-10-13T08:00:00Z',
};
const flat = (v) => new Float32Array(9).fill(v);
const readers = (gridValue) => ({
  listSurfaces: async () => [OBORO],
  downloadSurfaceGrid: async () => flat(gridValue),
  listWellsWithTops: async () => [],
});

test('a surface pick 8 m below the Oboro Sand top lands on T1', () => {
  const t = targetFromSurfacePick(OBORO, flat(-1877.36), 402250, 521750, 'T1 Oboro Sand', { belowM: 8 });
  expect(t.tvdss_m).toBeCloseTo(1885.36, 4);
  expect(t.provenance).toMatchObject({ below_pick_m: 8 });
  expect(t.provenance.picked_tvdss_m).toBeCloseTo(1877.36, 4);
  // no stand-off: on the pick, and nothing extra recorded
  const on = targetFromSurfacePick(OBORO, flat(-1877.36), 402250, 521750);
  expect(on.tvdss_m).toBeCloseTo(1877.36, 4);
  expect(on.provenance.below_pick_m).toBeUndefined();
});

test('a top pick takes the stand-off too', () => {
  const well = { id: 'w8', name: 'Ekene-8', surface_x: 401700, surface_y: 521600, kb_m: 25, depth_ref_kind: 'KB', depth_ref_elev_m: 25, td_md_m: 2250, deviation: [] };
  const top = { id: 'tp', name: 'Oboro Sand', md_m: 1902.36 };
  const t = targetFromTop(well, top, '', { belowM: 8 });
  expect(t.tvdss_m).toBeCloseTo(1902.36 - 25 + 8, 6);
  expect(t.provenance.below_pick_m).toBe(8);
});

test('refresh re-runs the pick and keeps the stand-off', async () => {
  const t = { id: 'tg', name: 'T1 Oboro Sand', ...targetFromSurfacePick(OBORO, flat(-1877.36), 402250, 521750, 'T1 Oboro Sand', { belowM: 8 }) };
  // the map is re-gridded 6 m deeper
  const patch = await refreshTargetPatch({ ref: { target_id: 'tg', part: 'surface' } }, t, readers(-1883.36));
  expect(patch.tvdss_m).toBeCloseTo(1891.36, 4);
  expect(patch.provenance.below_pick_m).toBe(8);
  // negative control: a refresh that ran the pick without the stand-off would put the target on the map
  const bare = targetFromSurfacePick(OBORO, flat(-1883.36), 402250, 521750, t.name);
  expect(bare.tvdss_m).toBeCloseTo(1883.36, 4);
  expect(Math.abs(patch.tvdss_m - bare.tvdss_m)).toBeCloseTo(8, 4);
});

test('the dialog takes the stand-off in feet: 26.25 ft below the pick is 8.001 m', async () => {
  mockSurfaces.splice(0, mockSurfaces.length, OBORO);
  const onPick = jest.fn();
  render(<TargetFromRegistryDialog open mode="surface" onOpenChange={() => {}} onPick={onPick} depthUnit="ft" />);
  await waitFor(() => expect(screen.getByRole('option', { name: OBORO.name })).toBeInTheDocument());
  expect(screen.getByText('Depth below the pick (ft)')).toBeInTheDocument();
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: OBORO.id } });
  fireEvent.change(screen.getByTestId('wd-pick-x'), { target: { value: '402250' } });
  fireEvent.change(screen.getByTestId('wd-pick-y'), { target: { value: '521750' } });
  fireEvent.change(screen.getByTestId('wd-pick-below'), { target: { value: '26.25' } });
  fireEvent.change(screen.getByTestId('wd-pick-name'), { target: { value: 'T1 Oboro Sand' } });
  fireEvent.click(screen.getByTestId('wd-pick-create'));
  await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
  const t = onPick.mock.calls[0][0];
  expect(t.provenance.below_pick_m).toBeCloseTo(8.001, 3);
  expect(t.tvdss_m).toBeCloseTo(1877.36 + 8.001, 3);
  expect(t.name).toBe('T1 Oboro Sand');
});

test('negative control: a metre view stores the stand-off as typed', async () => {
  mockSurfaces.splice(0, mockSurfaces.length, OBORO);
  const onPick = jest.fn();
  render(<TargetFromRegistryDialog open mode="surface" onOpenChange={() => {}} onPick={onPick} depthUnit="m" />);
  await waitFor(() => expect(screen.getByRole('option', { name: OBORO.name })).toBeInTheDocument());
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: OBORO.id } });
  fireEvent.change(screen.getByTestId('wd-pick-x'), { target: { value: '402250' } });
  fireEvent.change(screen.getByTestId('wd-pick-y'), { target: { value: '521750' } });
  fireEvent.change(screen.getByTestId('wd-pick-below'), { target: { value: '8' } });
  fireEvent.click(screen.getByTestId('wd-pick-create'));
  await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
  expect(onPick.mock.calls[0][0].tvdss_m).toBeCloseTo(1885.36, 4);
});
