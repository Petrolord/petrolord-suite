/**
 * EC2 (engines #186) in the Fiscal Regime Designer.
 *
 * The regime sandbox now follows the screening engine's IRR contract: a rate
 * is reported only when it is a verified root inside -99 to 1000 percent, so
 * `irr` is null for most of the test project's regimes (the 25 year tail
 * changes the contractor cash flow's sign more than once). The summary table
 * used to call `s.irr.toFixed(1)` and crashed on that null; it now prints
 * n/a with the reason. A tier table with a repeated threshold is refused by
 * the engine, and the regime editor shows that refusal where it is edited.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { runFiscalComparison } from '@/utils/fiscalDesignerCalculations';
import { irrText, tierTableRefusal } from '@/components/fiscaldesigner/fiscalResultText';
import ResultsPanel from '@/components/fiscaldesigner/ResultsPanel';
import RegimeCard from '@/components/fiscaldesigner/RegimeCard';

jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const R = require('react');
  const ResponsiveContainer = ({ children }) => R.cloneElement(children, { width: 800, height: 360 });
  return { ...actual, ResponsiveContainer };
});

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

// A project whose contractor cash flow changes sign more than once over the
// 25 year life, which is the ordinary case and the one that crashed the
// panel: two rates zero the NPV, so neither is "the" return.
const PROJECT = {
  name: 'Test project',
  production: {
    oil: { initial: 30000, decline: 12 },
    gas: { initial: 0, decline: 0 },
    ngl: { initial: 0, decline: 0 },
  },
  prices: [{ year: 1, oil: 80, gas: 3, ngl: 45 }],
  costs: { capex: { drilling: 400, facilities: 500, subsea: 100 }, opex: { fixed: 60, variable: 4 } },
  discountRate: 10,
};

const REGIME = {
  id: 1,
  name: 'Nigerian PIA (PSC)',
  royalty: { type: 'sliding_price', tiers: [{ threshold: 60, rate: 12.5 }, { threshold: 80, rate: 15 }] },
  tax: { cit: 30, rrt: 20, minTax: 2 },
  costRecoveryLimit: 70,
  profitSplit: { type: 'tiered_r_factor', tiers: [{ threshold: 1.0, split: 60 }, { threshold: 1.5, split: 50 }] },
};

describe('irrText', () => {
  it('prints a reported rate, and nothing else (negative control)', () => {
    expect(irrText({ irr: 23.456, irrStatus: 'ok' })).toEqual({ value: '23.5%', reason: null });
  });

  it('names the reason for every status the engine can report', () => {
    expect(irrText({ irr: null, irrStatus: 'no-sign-change' })).toEqual({
      value: 'n/a',
      reason: 'no IRR: the contractor cash flow never changes sign',
    });
    expect(irrText({ irr: null, irrStatus: 'no-root' }).reason)
      .toBe('no IRR: no rate from -99 to 1000 percent brings NPV to zero');
    expect(irrText({ irr: null, irrStatus: 'above-clamp' }).reason)
      .toBe('IRR above 1000 percent, beyond the band searched');
    const multi = irrText({
      irr: null, irrStatus: 'multiple-roots', irrRoots: [-36.67, 21.004], irrRootAboveBand: false,
    });
    expect(multi.value).toBe('n/a');
    expect(multi.reason).toBe('no single IRR: NPV is zero at -36.7% and 21.0%');
    // A root above the band is named as such rather than printed as a rate.
    expect(irrText({
      irr: null, irrStatus: 'multiple-roots', irrRoots: [12.3], irrRootAboveBand: true,
    }).reason).toBe('no single IRR: NPV is zero at 12.3% and a rate above 1000 percent');
  });

  it('never returns undefined or NaN for an unknown status', () => {
    const t = irrText({ irr: null, irrStatus: 'something-new' });
    expect(t.value).toBe('n/a');
    expect(t.reason).toBe('no IRR reported');
    expect(JSON.stringify(t)).not.toMatch(/NaN|undefined/);
  });
});

describe('the summary table on a null IRR', () => {
  it('renders the reason instead of crashing on irr.toFixed', async () => {
    const results = await runFiscalComparison({ projectInputs: PROJECT, regimes: [REGIME] });
    const row = results.summary[0];
    // The test project really does produce a null IRR here: that is the case
    // that crashed the panel.
    expect(row.irr).toBeNull();
    expect(row.irrStatus).toBe('multiple-roots');

    render(<ResultsPanel results={results} />);
    const cell = document.querySelector('td[data-metric="irr"]');
    expect(cell.textContent).toContain('n/a');
    expect(cell.textContent).toMatch(/no single IRR: NPV is zero at/);
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
  });

  it('negative control: a reported rate prints as a rate with no reason line', async () => {
    const results = await runFiscalComparison({ projectInputs: PROJECT, regimes: [REGIME] });
    results.summary[0] = {
      ...results.summary[0], irr: 18.25, irrStatus: 'ok', irrRoots: null,
    };
    render(<ResultsPanel results={results} />);
    const cell = document.querySelector('td[data-metric="irr"]');
    expect(cell.textContent).toBe('18.3%');
  });

  it('prefers the named government share over the deprecated alias', async () => {
    const results = await runFiscalComparison({ projectInputs: PROJECT, regimes: [REGIME] });
    // EC2-2: effectiveTaxRate is now an alias of the named field and may be
    // null; the panel reads the named one.
    expect(results.summary[0].effectiveTaxRate)
      .toBe(results.summary[0].governmentShareOfNetRevenuePct);
    const source = require('fs').readFileSync(
      require('path').resolve(__dirname, '../ResultsPanel.jsx'), 'utf8',
    );
    expect(source).not.toMatch(/effectiveTaxRate/);
  });
});

describe('a tier table with a repeated threshold', () => {
  const clashing = {
    ...REGIME,
    name: 'Clashing PSC',
    royalty: { type: 'sliding_price', tiers: [{ threshold: 60, rate: 12.5 }, { threshold: 60, rate: 15 }] },
  };

  it('is refused by the engine and reported by the regime editor', () => {
    const message = tierTableRefusal(clashing, 'royalty');
    expect(message).toMatch(/Clashing PSC.*royalty tier table has more than one tier at threshold 60/);
    render(<RegimeCard regime={clashing} onChange={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it('negative control: distinct thresholds raise nothing, in either table', () => {
    expect(tierTableRefusal(REGIME, 'royalty')).toBeNull();
    expect(tierTableRefusal(REGIME, 'profitSplit')).toBeNull();
    // A flat table has no tiers to clash.
    expect(tierTableRefusal({ ...REGIME, royalty: { type: 'flat', rate: 12.5 } }, 'royalty')).toBeNull();
    render(<RegimeCard regime={REGIME} onChange={() => {}} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
