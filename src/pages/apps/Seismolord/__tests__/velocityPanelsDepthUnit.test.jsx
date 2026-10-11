/**
 * The velocity calibration and the stacking-velocity (Dix) panel showed
 * depths in metres whatever the organisation's unit, so on a feet project
 * (the Ekene field, set up oilfield) the residuals sat in metres next to
 * depth maps in feet. They now follow the depth unit; velocities stay as
 * entered.
 */
import React from 'react';
import '@testing-library/jest-dom';
import {
  render, screen, fireEvent, waitFor, within,
} from '@testing-library/react';
import WellTiePanel from '../components/WellTiePanel';
import StackingVelocityPanel from '../components/workspace/StackingVelocityPanel';

jest.mock('../engine/wellTie', () => ({
  buildTiePoints: () => [{}],
  calibrationProvenance: () => ({}),
  fitWellTie: () => ({
    model: { kind: 'linear', v0: 2000, k: 0 },
    manifestModel: { kind: 'linear', v0: 2000, k: 0 },
    rmsBeforeM: 3.048,
    rmsAfterM: 0.3048,
    fittedLayers: [true],
    residuals: [{
      wellName: 'Ekene-1', topName: 'Ekene Sand', horizonId: 'h1', twtMs: 1291.1, zTopM: 1523.0, beforeM: 3.048, afterM: 0.6096,
    }],
  }),
}));

const wells = [{ name: 'Ekene-1', tops: [{ name: 'Ekene Sand', md: 1548 }] }];
const horizons = [{ id: 'h1', name: 'Ekene Sand (2)', params: { source: 'well_tops', role: 'mapped', top_name: 'Ekene Sand' } }];
const panel = (depthUnit) => (
  <WellTiePanel
    wells={wells}
    horizons={horizons}
    velocityModel={{ kind: 'linear', v0: 2000, k: 0 }}
    dtUs={4000}
    geom={{ nIl: 10, nXl: 10, ns: 100 }}
    affine={{ origin: { x: 0, y: 0 }, ilVec: { x: 25, y: 0 }, xlVec: { x: 0, y: 25 } }}
    loadGrid={async () => new Float32Array(100)}
    onApply={async () => {}}
    depthUnit={depthUnit}
  />
);

test('calibration residuals and RMS in feet on a feet project', async () => {
  render(panel('ft'));
  fireEvent.click(screen.getByTestId('welltie-fit'));
  await waitFor(() => expect(screen.getByTestId('welltie-rms')).toBeInTheDocument());
  expect(screen.getByTestId('welltie-rms').textContent).toMatch(/RMS 10\.0 ft → 1\.0 ft/);
  expect(screen.getByText('top ft')).toBeInTheDocument();
  const row = within(screen.getByTestId('welltie-residuals')).getByText('Ekene-1').closest('tr');
  expect(row.textContent).toMatch(/4996\.7/);   // 1523.0 m
  expect(row.textContent).toMatch(/2\.0$/);     // 0.6096 m after
});

test('and in metres on a metres project', async () => {
  render(panel('m'));
  fireEvent.click(screen.getByTestId('welltie-fit'));
  await waitFor(() => expect(screen.getByTestId('welltie-rms')).toBeInTheDocument());
  expect(screen.getByTestId('welltie-rms').textContent).toMatch(/RMS 3\.0 m → 0\.3 m/);
  expect(screen.getByText('top m')).toBeInTheDocument();
});

test('the Dix table gives depths in feet on a feet project', () => {
  render(<StackingVelocityPanel velMode="linear" velLayers={[]} onUseLinear={() => {}} onUseLayers={() => {}} depthUnit="ft" />);
  fireEvent.change(screen.getByTestId('sl-stacking-input'), { target: { value: '1000 2000\n2000 2000' } });
  expect(screen.getByText('Depth at base (ft)')).toBeInTheDocument();
  // 1000 ms at 2000 m/s: 1,000 m = 3,281 ft; 2000 ms: 2,000 m = 6,562 ft
  const table = screen.getByTestId('sl-dix-table');
  expect(table.textContent).toMatch(/3,281/);
  expect(table.textContent).toMatch(/6,562/);
  expect(screen.getByTestId('sl-dix-fit').textContent).toMatch(/ ft against the Dix depths/);
});
