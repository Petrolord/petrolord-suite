/**
 * The well-tie panel pairs each top with the horizon Tops to Horizons made
 * from it, so the velocity calibration runs in one click; an interpreter's
 * own choice (including none) still wins.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import WellTiePanel from '../components/WellTiePanel';

const wells = [{ name: 'W-1', tops: [{ name: 'TOP_A', md: 700 }, { name: 'TOP_B', md: 900 }, { name: 'TOP_X', md: 1000 }] }];
const horizons = [
  { id: 'h1', name: 'TOP_A', params: { source: 'well_tops', role: 'mapped', top_name: 'TOP_A' } },
  { id: 'h2', name: 'TOP_B (2)', params: { source: 'well_tops', role: 'mapped', top_name: 'TOP_B' } },
  { id: 'h3', name: 'TOP_C2', params: { source: 'well_tops', role: 'conformable', top_name: 'TOP_X' } },
  { id: 'h4', name: 'hand picked', params: { source: 'track3d' } },
];

test('tops pair with their Tops to Horizons horizons; conformable and hand-picked ones are not paired', () => {
  render(
    <WellTiePanel
      wells={wells}
      horizons={horizons}
      velocityModel={{ kind: 'linear', v0: 2000, k: 0 }}
      dtUs={4000}
      geom={{ nIl: 10, nXl: 10, ns: 100 }}
      affine={null}
      loadGrid={async () => new Float32Array(100)}
      onApply={async () => {}}
    />,
  );
  expect(screen.getByTestId('welltie-pair-TOP_A').value).toBe('h1');
  expect(screen.getByTestId('welltie-pair-TOP_B').value).toBe('h2');
  expect(screen.getByTestId('welltie-pair-TOP_X').value).toBe('');
  // the interpreter unpairs one: their choice wins
  fireEvent.change(screen.getByTestId('welltie-pair-TOP_A'), { target: { value: '' } });
  expect(screen.getByTestId('welltie-pair-TOP_A').value).toBe('');
});
