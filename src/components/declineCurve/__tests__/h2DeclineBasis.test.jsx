/**
 * H2 (Reservoir honesty sweep): the fit stores Di per day (the engine fits
 * on a time axis in days). The KPI card printed Di x 365 x 100 as "%/yr",
 * while the Diagnostics card on the same screen printed Di x 100 under the
 * same "%/yr" label, 365 times smaller. Every place that shows Di now goes
 * through one formatter that states the basis (nominal) and the time unit.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { calculateArpsHyperbolic } from '@/utils/declineCurve/dcaEngine';
import {
  nominalAnnualPct, effectiveFirstYearPct, formatNominalAnnual, DI_BASIS_LABEL,
} from '@/utils/declineCurve/declineDisplay';

// Ekene-1's fitted exponential: 120 stb/d, 0.0012 per day.
const FIT = {
  qi: 120, Di: 0.0012, b: 0, modelType: 'Exponential', R2: 0.98, RMSE: 3.1, t0: '2023-01-01T00:00:00.000Z',
  parameters: { qi: 120, Di: 0.0012, b: 0 }, actualData: [], predictedData: [],
};
const HISTORY = Array.from({ length: 24 }, (_, i) => ({
  date: new Date(Date.UTC(2023, i, 1)).toISOString(),
  oilRate: 120 * Math.exp(-0.0012 * i * 30.4),
}));

jest.mock('@/contexts/DeclineCurveContext', () => ({
  useDeclineCurve: jest.fn(),
}));
jest.mock('recharts', () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return new Proxy({}, { get: () => Stub });
});
jest.mock('@/components/charts/ChartLogo', () => () => null);

import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import DCAFitDiagnostics from '@/components/declineCurve/DCAFitDiagnostics';
import DCAKPICardsEnhanced from '@/components/declineCurve/DCAKPICardsEnhanced';

const SRC = path.resolve(__dirname, '../../..');

beforeEach(() => {
  useDeclineCurve.mockReturnValue({
    wells: { w1: { id: 'w1', name: 'Ekene-1', data: HISTORY } },
    currentWellId: 'w1',
    currentWell: { id: 'w1', name: 'Ekene-1' },
    selectedStream: 'oil',
    streamState: { oil: { fitResults: FIT, forecastResults: null } },
  });
});

describe('H2: one basis for Di on the screen', () => {
  // DCA-U1-010: a year is 365.25 days (the registry's year), so 43.83, not 43.80
  it('nominal annual decline is the per-day Di times 365.25, in percent', () => {
    expect(nominalAnnualPct(0.0012)).toBeCloseTo(43.83, 10);
    expect(formatNominalAnnual(0.0012)).toBe('43.83');
    expect(formatNominalAnnual(null)).toBe('n/a');
    expect(DI_BASIS_LABEL).toBe('nominal, %/yr');
  });

  it('effective first-year decline is read off the engine rate, for any b', () => {
    for (const b of [0, 0.5, 1]) {
      const q365 = calculateArpsHyperbolic(120, 0.0012, b, 365.25);
      expect(effectiveFirstYearPct(0.0012, b)).toBeCloseTo((1 - q365 / 120) * 100, 9);
    }
    // exponential closed form, 1 - exp(-D): about 35.5 percent, well below
    // the 43.8 percent nominal, which is why the two must not share a label
    expect(effectiveFirstYearPct(0.0012, 0)).toBeCloseTo((1 - Math.exp(-0.4383)) * 100, 6);
  });

  it('the KPI card and the Diagnostics card show the same Di, with the basis named', () => {
    render(<><DCAKPICardsEnhanced /><DCAFitDiagnostics /></>);
    const kpi = screen.getByTestId('dca-di-kpi');
    const diag = screen.getByTestId('dca-di-diagnostics');
    expect(kpi).toHaveTextContent('43.83');
    expect(diag.textContent).toBe(kpi.textContent);
    // negative control: the old diagnostics number was Di x 100
    expect(diag.textContent).not.toBe('0.12');
    expect(screen.getByTestId('dca-di-diagnostics-basis')).toHaveTextContent('nominal, %/yr');
    expect(screen.getByTestId('dca-di-kpi-basis')).toHaveTextContent(/nominal/i);
    // both also state the effective first-year figure, from the same helper
    const eff = effectiveFirstYearPct(0.0012, 0).toFixed(2);
    expect(screen.getByTestId('dca-di-diagnostics-effective')).toHaveTextContent(eff);
    expect(screen.getByTestId('dca-di-kpi-effective')).toHaveTextContent(eff);
  });

  it('no DCA component formats Di on its own', () => {
    const dir = path.join(SRC, 'components/declineCurve');
    const offenders = [];
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.jsx') || f === 'DCAHelpContent.jsx') continue;
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      // Di multiplied or printed directly in JSX: Di * 100, Di*365*100, Di.toFixed
      if (/\bDi\s*\*\s*(100|365)|\bDi\s*\)?\s*\.toFixed\(|\bDi\??\.toFixed\(/.test(text)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
