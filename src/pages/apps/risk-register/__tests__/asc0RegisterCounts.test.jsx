/**
 * ASC-0 (RC-6): the Risk Register's counts agree.
 *
 * Before: the dashboard heatmap and Critical tile counted Open and Under
 * Review, the Heatmap tab counted the four live statuses, Total counted
 * Draft and Closed, "Mitigated or closed" mixed a live and a finished
 * status, and the heatmap legend restated the band edges.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RISK_BANDS, RISK_LIVE_STATUSES } from '@/lib/riskScoring';
import { registerCounts, liveRisks } from '../utils/registerCounts';

let mockRisks = [];
jest.mock('../hooks/useRiskRegister', () => ({
  useRiskRegister: () => ({ risks: mockRisks, loading: false, error: null }),
}));

// jest.mock is hoisted above every import.
import RiskRegisterDashboardPage from '../RiskRegisterDashboardPage';
import RiskHeatmapPage from '../RiskHeatmapPage';
import { RiskHeatmapMatrix } from '../components/RiskHeatmapMatrix';

const risk = (id, status, likelihood, impact) => ({
  id, risk_id: `R-${id}`, title: id, status, likelihood, impact, risk_score: likelihood * impact,
});

// Critical is 15 and up; 5 x 4 = 20, 5 x 5 = 25, 2 x 2 = 4.
const REGISTER = [
  risk('open', 'Open', 5, 4),
  risk('review', 'Under Review', 2, 2),
  risk('mitigated', 'Mitigated', 5, 5),
  risk('realized', 'Realized', 5, 4),
  risk('draft', 'Draft', 5, 5),
  risk('closed', 'Closed', 5, 4),
];

describe('registerCounts', () => {
  it('counts the live population the engine defines, and nothing else', () => {
    expect(registerCounts(REGISTER)).toEqual({
      recorded: 6,
      live: 4,
      liveCritical: 3,
      liveMitigated: 1,
      notLive: 2,
    });
    expect(liveRisks(REGISTER).map((r) => r.status)).toEqual([...RISK_LIVE_STATUSES]);
  });
});

const tile = (id) => {
  const el = screen.getByTestId(`tile-${id}`);
  const [value, label] = el.querySelectorAll('span');
  return { value: value.textContent, label: label.textContent.trim() };
};
const cellCounts = (container) => [...container.querySelectorAll('button')]
  .map((b) => b.textContent).filter((t) => /^\d+$/.test(t));

describe('the dashboard tiles say what they count', () => {
  beforeEach(() => { mockRisks = REGISTER; });

  const renderDashboard = (onDrillDown = () => {}) => render(
    <MemoryRouter><RiskRegisterDashboardPage onDrillDown={onDrillDown} /></MemoryRouter>,
  );

  it('shows live, live Critical, Mitigated and not-live figures', () => {
    renderDashboard();
    expect(tile('live')).toEqual({ value: '4', label: 'Live risks' });
    expect(tile('live-critical')).toEqual({ value: '3', label: 'Live and Critical' });
    expect(tile('mitigated')).toEqual({ value: '1', label: 'Mitigated' });
    expect(tile('not-live')).toEqual({ value: '2', label: 'Draft or closed' });
    expect(screen.queryByText(/Total Risks/i)).toBeNull();
    expect(screen.queryByText(/Mitigated or closed/i)).toBeNull();
  });

  it('the dashboard heatmap and the Heatmap tab plot the same risks and drill down the same way', () => {
    const fromDashboard = jest.fn();
    const { container: dash, unmount } = renderDashboard(fromDashboard);
    const dashCounts = cellCounts(dash);
    fireEvent.click([...dash.querySelectorAll('button')].find((b) => b.textContent === '2'));
    unmount();

    const fromTab = jest.fn();
    const { container: tab } = render(<RiskHeatmapPage onDrillDown={fromTab} />);
    const tabCounts = cellCounts(tab);
    fireEvent.click([...tab.querySelectorAll('button')].find((b) => b.textContent === '2'));

    expect(dashCounts).toEqual(tabCounts);
    // Open and Realized share cell (5, 4); Closed at (5, 4) is not live.
    expect(dashCounts.sort()).toEqual(['1', '1', '2']);
    expect(fromDashboard.mock.calls[0][0]).toEqual(fromTab.mock.calls[0][0]);
    expect(fromTab.mock.calls[0][0].statuses).toEqual([...RISK_LIVE_STATUSES]);
  });
});

describe('the heatmap legend reads its bands from the engine', () => {
  it('prints every RISK_BANDS entry with its edges', () => {
    render(<RiskHeatmapMatrix risks={[]} />);
    const legend = screen.getByTestId('risk-band-legend');
    const expected = [...RISK_BANDS].reverse().map((b) => `${b.band} (${b.min}-${b.max})`);
    expect(within(legend).getAllByText(/\(\d+-\d+\)/).map((n) => n.textContent.trim()))
      .toEqual(expected);
  });

  it('keeps no second copy of the thresholds', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../components/RiskHeatmapMatrix.jsx'), 'utf8');
    RISK_BANDS.forEach((b) => {
      expect(src).not.toContain(`${b.min}-${b.max}`);
    });
  });
});
