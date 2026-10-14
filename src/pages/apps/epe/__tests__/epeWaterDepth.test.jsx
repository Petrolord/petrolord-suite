/**
 * The PIA water depth in the user's depth unit (video programme, 2026-10-14):
 * the Run Console asked for metres only, while the demo org and most Nigerian
 * users work in feet. The config still stores metres for the engine.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StaticUnitProfileProvider } from '@/lib/units/UnitProfileContext';
import { makeProfile } from '@/lib/units/presets';
import EpeWaterDepthField, { depthToView, depthFromView, M_PER_FT } from '../EpeWaterDepthField';

const Harness = ({ preset, initial = 100, onM }) => {
  const [m, setM] = React.useState(initial);
  return (
    <StaticUnitProfileProvider layers={{ user: makeProfile(preset), tableAvailable: true }}>
      <EpeWaterDepthField valueM={m} onChangeM={(v) => { setM(v); onM(v); }} />
    </StaticUnitProfileProvider>
  );
};

describe('water depth in the user unit', () => {
  it('conversions', () => {
    expect(M_PER_FT).toBe(0.3048);
    expect(depthToView(35, 'ft')).toBe('114.8');
    expect(depthFromView('114.8', 'ft')).toBe(34.991);
    expect(depthToView(35, 'm')).toBe('35');
    expect(depthFromView('', 'ft')).toBe('');
  });
  it('oilfield: typed in feet, stored in metres, and says so', async () => {
    const onM = jest.fn();
    render(<Harness preset="oilfield" onM={onM} />);
    const input = screen.getByLabelText(/Water depth/);
    expect(screen.getByText('(ft)')).toBeInTheDocument();
    expect(input).toHaveValue(328.1);
    await userEvent.clear(input);
    await userEvent.type(input, '114.8');
    expect(input).toHaveValue(114.8);
    expect(onM).toHaveBeenLastCalledWith(34.991);
    expect(screen.getByTestId('epe-water-depth-stored')).toHaveTextContent('Stored as 34.99 m: the PIA sorts terrain by water depth in metres.');
  });
  it('metric: metres as before, no note (negative control for the conversion)', async () => {
    const onM = jest.fn();
    render(<Harness preset="metric" onM={onM} />);
    const input = screen.getByLabelText(/Water depth/);
    expect(screen.getByText('(m)')).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, '35');
    expect(onM).toHaveBeenLastCalledWith(35);
    expect(screen.queryByTestId('epe-water-depth-stored')).toBeNull();
  });
});
