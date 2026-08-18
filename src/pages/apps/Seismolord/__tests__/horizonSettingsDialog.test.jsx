/**
 * HorizonSettingsDialog — Petrel-style horizon display settings. Asserts
 * the live onChange contract (color, line weight, map style, color
 * range) and the rename path.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import HorizonSettingsDialog from '@/pages/apps/Seismolord/components/workspace/dialogs/HorizonSettingsDialog';

const horizon = {
  id: 'h1',
  name: 'Top Reservoir',
  stats: { coverage: 0.82, tracked: 12345, min_twt_ms: 1450, max_twt_ms: 1710 },
  params: {},
};

const setup = (display = {}) => {
  const onChange = jest.fn();
  const onRename = jest.fn();
  render(
    <HorizonSettingsDialog
      open
      onOpenChange={() => {}}
      horizon={horizon}
      display={display}
      onChange={onChange}
      onRename={onRename}
    />,
  );
  return { onChange, onRename };
};

describe('HorizonSettingsDialog', () => {
  test('shows identity and stats', () => {
    setup();
    expect(screen.getByText('Horizon settings')).toBeInTheDocument();
    expect(screen.getByLabelText('Horizon name').value).toBe('Top Reservoir');
    expect(screen.getByText(/82% coverage/)).toBeInTheDocument();
    expect(screen.getByText(/1450–1710 ms TWT/)).toBeInTheDocument();
  });

  test('color swatch click reports the color', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByLabelText('Color #f59e0b'));
    expect(onChange).toHaveBeenCalledWith({ color: '#f59e0b' });
  });

  test('line weight select reports a numeric width', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('Line weight'), { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith({ lineWidth: 2 });
  });

  test('map colormap override and clear', () => {
    const { onChange } = setup({ colormap: 'viridis' });
    const select = screen.getByLabelText('Map colormap');
    expect(select.value).toBe('viridis');
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ colormap: undefined });
  });

  test('opacity slider reports a 0–1 fraction', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('Fill opacity'), { target: { value: '40' } });
    expect(onChange).toHaveBeenCalledWith({ opacity: 0.4 });
  });

  test('contours toggle and interval', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByLabelText('Show contours'));
    expect(onChange).toHaveBeenCalledWith({ contours: false });
    fireEvent.change(screen.getByLabelText('Contour interval'), { target: { value: '25' } });
    expect(onChange).toHaveBeenCalledWith({ contourStep: 25 });
  });

  test('manual color range exposes min/max inputs', () => {
    const { onChange } = setup({ rangeMode: 'manual', zMin: 1400, zMax: 1800 });
    fireEvent.change(screen.getByLabelText('Color range minimum'), { target: { value: '1500' } });
    expect(onChange).toHaveBeenCalledWith({ zMin: 1500 });
    fireEvent.change(screen.getByLabelText('Color range mode'), { target: { value: 'auto' } });
    expect(onChange).toHaveBeenCalledWith({ rangeMode: undefined });
  });

  test('rename commits only a changed, non-empty name', () => {
    const { onRename } = setup();
    const input = screen.getByLabelText('Horizon name');
    const button = screen.getByRole('button', { name: 'Rename' });
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Top Reservoir v2' } });
    fireEvent.click(button);
    expect(onRename).toHaveBeenCalledWith('Top Reservoir v2');
  });
});
