// Pore Pressure U2-003 in Well Design: kick and trip margins and the
// bottom-up casing seats on the mud window, in TVD and MD.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import MudWindowPanel from '../charts/MudWindowPanel';

beforeAll(() => {
  global.ResizeObserver = global.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
});

// a window that closes on the ramp: PP 9 ppg to 3,000 m TVD then +2.5 ppg/1000 m; FG 14 to 15 ppg
const rows = [];
for (let tvd = 100; tvd <= 4500; tvd += 50) {
  const pp = tvd < 3000 ? 9 : 9 + (2.5 * (tvd - 3000)) / 1000;
  const fp = 12 + (3 * tvd) / 4500;
  rows.push({ md: tvd * 1.1, tvd, ppPpg: pp, fpPpg: fp, ppEmw: pp / 8.345404, fpEmw: fp / 8.345404, ppMpa: 1, fpMpa: 2, windowMpa: 1 });
}

test('seats are listed in TVD with their MD, and follow the margins', () => {
  render(<MudWindowPanel rows={rows} depthUnit="m" />);
  const line = screen.getByTestId('mud-window-seats');
  expect(Number(line.getAttribute('data-seats'))).toBeGreaterThan(0);
  expect(line).toHaveTextContent(/shoe 1 at least TVD \d+ m \(MD \d+\)/);
  const before = line.textContent;
  fireEvent.change(screen.getByTestId('mud-window-trip'), { target: { value: '0' } });
  fireEvent.change(screen.getByTestId('mud-window-kick'), { target: { value: '0' } });
  expect(screen.getByTestId('mud-window-seats').textContent).not.toBe(before);
  fireEvent.change(screen.getByTestId('mud-window-kick'), { target: { value: '' } });
  expect(screen.getByTestId('mud-window-margins')).toHaveTextContent(/Enter margins of 0 or more/);
  expect(screen.queryByTestId('mud-window-seats')).toBeNull();
});
