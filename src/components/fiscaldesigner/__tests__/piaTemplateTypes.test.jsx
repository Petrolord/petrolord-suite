/**
 * Engines 3.12.0 (EC7 repair 12): the "Nigeria - PIA (2021)" template is
 * re-based on the Act with three new sandbox types: royalty 'pia_2021',
 * profit split 'pia_cumulative_production' and costRecoveryBase
 * 'liquids_gross'. The Fiscal Regime Designer editor and the template
 * selector must render them, and the comparison must run them through the
 * vendored engine.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { fiscalTemplates, LEGACY_PRE_AUDIT_PIA_TEMPLATE } from '@/utils/fiscalTemplates';
import { runFiscalComparison } from '@/utils/fiscalDesignerCalculations';
import RegimeCard, { __test__ } from '../RegimeCard';
import TemplateSelector, { templateTermsSummary } from '../TemplateSelector';
import { tierTableRefusal } from '../fiscalResultText';

beforeAll(() => { global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; });

const PIA = fiscalTemplates.find((t) => t.name === 'Nigeria - PIA (2021)');

describe('the re-based PIA template', () => {
  test('carries the three new types (vendored engines 3.12.0)', () => {
    expect(PIA.regime.royalty.type).toBe('pia_2021');
    expect(PIA.regime.profitSplit.type).toBe('pia_cumulative_production');
    expect(PIA.regime.costRecoveryBase).toBe('liquids_gross');
    expect(PIA.regime.costRecoveryLimit).toBe(70);
    // the pre-audit template stays exported for past comparisons, out of the list
    expect(LEGACY_PRE_AUDIT_PIA_TEMPLATE.regime.royalty.type).toBe('sliding_price');
    expect(fiscalTemplates).not.toContain(LEGACY_PRE_AUDIT_PIA_TEMPLATE);
  });
});

describe('RegimeCard renders the PIA types', () => {
  const regime = { id: 7, name: PIA.name, ...JSON.parse(JSON.stringify(PIA.regime)) };

  test('pia_2021 royalty fields and the cumulative production bands', () => {
    render(<RegimeCard regime={regime} onChange={() => {}} />);
    expect(screen.getByTestId('pia-2021-royalty')).toBeTruthy();
    expect(screen.getByDisplayValue('2027')).toBeTruthy();
    const bands = screen.getByTestId('pia-cumulative-split');
    expect(bands.querySelectorAll('input')).toHaveLength(12);
    // the open top band shows empty with its "and above" placeholder
    expect(bands.querySelectorAll('input[placeholder="and above"]')[5].value).toBe('');
    expect(screen.getByText(/PIA Seventh Schedule para 14\(4\)/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('negative control: a sliding-price regime shows neither PIA block', () => {
    const legacy = { id: 8, name: 'old', ...JSON.parse(JSON.stringify(LEGACY_PRE_AUDIT_PIA_TEMPLATE.regime)) };
    render(<RegimeCard regime={legacy} onChange={() => {}} />);
    expect(screen.queryByTestId('pia-2021-royalty')).toBeNull();
    expect(screen.queryByTestId('pia-cumulative-split')).toBeNull();
  });

  test('switching a type fills what the new type needs and keeps what is there', () => {
    const { switchType, ROYALTY_DEFAULTS, SPLIT_DEFAULTS } = __test__;
    const toSliding = switchType(PIA.regime.royalty, 'sliding_price', ROYALTY_DEFAULTS);
    expect(Array.isArray(toSliding.tiers)).toBe(true);
    const toPia = switchType({ type: 'flat', rate: 12 }, 'pia_2021', ROYALTY_DEFAULTS);
    expect(toPia).toMatchObject({ type: 'pia_2021', terrain: 'deep_offshore', firstCalendarYear: 2027 });
    // R-factor tiers are not reused as cumulative bands
    const toBands = switchType({ type: 'tiered_r_factor', tiers: [{ threshold: 1, split: 60 }] }, 'pia_cumulative_production', SPLIT_DEFAULTS);
    expect(toBands.tiers[toBands.tiers.length - 1]).toEqual({ upToMMbbl: null, governmentPct: 45 });
  });

  test('an unordered or closed band table shows the engine\'s message', () => {
    const bad = { name: 'x', profitSplit: { type: 'pia_cumulative_production', tiers: [{ upToMMbbl: 100, governmentPct: 10 }, { upToMMbbl: 50, governmentPct: 5 }] } };
    expect(tierTableRefusal(bad, 'profitSplit')).toMatch(/ascending upToMMbbl with the last upToMMbbl null/);
    expect(tierTableRefusal({ name: 'y', profitSplit: PIA.regime.profitSplit }, 'profitSplit')).toBeNull();
    expect(tierTableRefusal({ name: 'z', royalty: PIA.regime.royalty }, 'royalty')).toBeNull();
  });
});

describe('TemplateSelector states the terms of every template', () => {
  test('the PIA template reads its new types in words', () => {
    const lines = templateTermsSummary(PIA.regime);
    expect(lines[0]).toMatch(/^Royalty PIA 2021, deep offshore: production tranches, royalty by price \(Regulations 2021 base\), gas 5%; year 1 is 2027$/);
    expect(lines[1]).toBe('Cost recovery limit 70% of gross crude oil and NGL value');
    expect(lines[2]).toMatch(/^Government profit oil by cumulative production 5% to 50 MMbbl, .*45% above$/);
    for (const t of fiscalTemplates) expect(templateTermsSummary(t.regime).every((l) => !/undefined/.test(l))).toBe(true);
  });

  test('renders the summary in the dialog', () => {
    render(<TemplateSelector isOpen onOpenChange={() => {}} onSelectTemplate={() => {}} />);
    expect(screen.getAllByTestId('template-terms')).toHaveLength(fiscalTemplates.length);
    expect(screen.getByText('Cost recovery limit 70% of gross crude oil and NGL value')).toBeTruthy();
  });
});

describe('the comparison runs the PIA types through the engine', () => {
  const PROJECT = {
    production: { oil: { initial: 60000, decline: 8 }, gas: { initial: 50, decline: 6 }, ngl: { initial: 1000, decline: 8 } },
    prices: [{ year: 1, oil: 75, gas: 3.5, ngl: 35 }],
    costs: { capex: { drilling: 900, facilities: 1200, subsea: 600 }, opex: { fixed: 120, variable: 8 } },
    discountRate: 10,
  };
  test('the re-based and the pre-audit templates give different answers, each finite', async () => {
    const res = await runFiscalComparison({
      projectInputs: PROJECT,
      regimes: [
        { id: 'pia', name: PIA.name, ...JSON.parse(JSON.stringify(PIA.regime)) },
        { id: 'old', name: 'pre-audit', ...JSON.parse(JSON.stringify(LEGACY_PRE_AUDIT_PIA_TEMPLATE.regime)) },
      ],
    });
    const a = res.summary.find((r) => r.id === 'pia');
    const b = res.summary.find((r) => r.id === 'old');
    expect(Number.isFinite(a.npv)).toBe(true);
    expect(Number.isFinite(b.npv)).toBe(true);
    expect(Math.abs(a.npv - b.npv)).toBeGreaterThan(1);
  });
});
