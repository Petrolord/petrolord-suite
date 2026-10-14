// PP-U1-005: the mud window opens in ppg EMW on a feet wellbore (g/cc on a
// metre one), shows TVD in the wellbore unit, names the curves' source and
// unit, and says why a curve was not read.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import MudWindowPanel from '../charts/MudWindowPanel';

beforeAll(() => {
  global.ResizeObserver = global.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
});

const rows = [
  { md: 1000, tvd: 1000, ppMpa: 10, fpMpa: 16, obgMpa: 22, ppEmw: 1.02, fpEmw: 1.63, obgEmw: 2.24, ppPpg: 8.5, fpPpg: 13.6, obgPpg: 18.7, windowMpa: 6 },
  { md: 2000, tvd: 2000, ppMpa: 21, fpMpa: 33, obgMpa: 45, ppEmw: 1.07, fpEmw: 1.68, obgEmw: 2.29, ppPpg: 8.9, fpPpg: 14.0, obgPpg: 19.1, windowMpa: 12 },
];
const summary = { fromTvd: 1000, toTvd: 2000, tightest: { tvd: 1000, windowMpa: 6 } };

test('feet wellbore: ppg first, TVD in ft, source and note shown', () => {
  render(<MudWindowPanel rows={rows} summary={summary} depthUnit="ft" sourceLabel="PP MPa (Pore Pressure Studio pp-1.1.0)" note="FP is in API, which is not a pressure." />);
  expect(screen.getByText(/ppg EMW vs TVD below RKB/)).toBeInTheDocument();
  expect(screen.getByTestId('mud-window-summary')).toHaveTextContent('TVD 3281 to 6562 ft');
  expect(screen.getByTestId('mud-window-source')).toHaveTextContent('Pore Pressure Studio pp-1.1.0');
  expect(screen.getByTestId('mud-window-note')).toHaveTextContent('not a pressure');
  fireEvent.click(screen.getByTestId('mud-window-mode-emw'));
  expect(screen.getByText(/g\/cc EMW vs TVD/)).toBeInTheDocument();
});

test('metre wellbore: g/cc first; no em dash in the copy', () => {
  const { container } = render(<MudWindowPanel rows={rows} summary={summary} depthUnit="m" sourceLabel="registry PPFG" />);
  expect(screen.getByText(/g\/cc EMW vs TVD/)).toBeInTheDocument();
  expect(screen.getByTestId('mud-window-summary')).toHaveTextContent('TVD 1000 to 2000 m');
  expect(container.textContent).not.toMatch(/[—–]/);
});

test('the summary gives the tightest window in the panel unit, below the seats\' top cut-off', () => {
  const r = [
    { md: 75, tvd: 75, ppMpa: 0.66, fpMpa: 0.71, obgMpa: 1.2, ppEmw: 1.03, fpEmw: 1.036, obgEmw: 1.6, ppPpg: 8.6, fpPpg: 8.65, obgPpg: 13.3, windowMpa: 0.05 },
    { md: 600, tvd: 600, ppMpa: 6.1, fpMpa: 8.5, obgMpa: 12, ppEmw: 1.042, fpEmw: 1.438, obgEmw: 2.0, ppPpg: 8.7, fpPpg: 12.0, obgPpg: 16.7, windowMpa: 2.4 },
    { md: 1400, tvd: 1400, ppMpa: 21.4, fpMpa: 22.7, obgMpa: 29, ppEmw: 1.558, fpEmw: 1.654, obgEmw: 2.1, ppPpg: 13.0, fpPpg: 13.8, obgPpg: 17.6, windowMpa: 1.3 },
  ];
  const s = { fromTvd: 75, toTvd: 1400, tightest: { tvd: 75, windowMpa: 0.05 } };
  const { unmount } = render(<MudWindowPanel rows={r} summary={s} depthUnit="ft" />);
  expect(screen.getByTestId('mud-window-summary').textContent.replace(/\s+/g, ' ')).toBe('TVD 246 to 4593 ft; tightest window 0.80 ppg EMW at TVD 4,593 ft (below the top 984 ft)');
  unmount();
  render(<MudWindowPanel rows={r} summary={s} depthUnit="m" />);
  expect(screen.getByTestId('mud-window-summary').textContent.replace(/\s+/g, ' ')).toBe('TVD 75 to 1400 m; tightest window 0.10 g/cc EMW at TVD 1,400 m (below the top 300 m)');
});
