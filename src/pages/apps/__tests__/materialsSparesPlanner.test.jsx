/**
 * Materials & Spares Planner views (SC3).
 *
 * One test per view: on the Ekene demo, what the view prints equals what a
 * DIRECT call of the vendored engine returns on the fixture's own stated
 * case and policy (the fixture is read from disk here, independently of the
 * app's adapters). Then the page itself: it mounts blank, loads the demo,
 * and prints an engine refusal word for word.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import {
  render, screen, fireEvent, within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
        eq: jest.fn(() => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) })),
      })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import * as inv from '../../../../packages/engines/engines/supplychain/inventory.js';
import MaterialsSparesPlanner from '@/pages/apps/MaterialsSparesPlanner';
import { MaterialsSparesProvider } from '@/contexts/MaterialsSparesContext';
import { defaultInputs, ekeneDemoInputs, fmtNum, fmtPct } from '@/utils/supplychain/materialsAdapters';
import RegisterView from '@/components/materials/RegisterView';
import CriticalityAbcView from '@/components/materials/CriticalityAbcView';
import EoqView from '@/components/materials/EoqView';
import SafetyStockView from '@/components/materials/SafetyStockView';
import InsuranceSparesView from '@/components/materials/InsuranceSparesView';
import LeadTimeRiskView from '@/components/materials/LeadTimeRiskView';
import SlowMovingView from '@/components/materials/SlowMovingView';
import { helpContent } from '@/components/materials/MaterialsSparesHelpGuide';

const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../packages/engines/test-data/supplychain/ekene-materials/register.json'), 'utf8'));
const strip = ({ item, note, ...rest }) => rest;
const pick = (keys) => (o) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const { policy, cases } = fixture;

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

const mountView = (View, inputs = ekeneDemoInputs()) => render(
  <MemoryRouter><MaterialsSparesProvider initialInputs={inputs}><View /></MaterialsSparesProvider></MemoryRouter>,
);
const text = (id) => screen.getByTestId(id).textContent;

describe('each view on the Ekene demo prints what the engine returns', () => {
  it('register: the 18 fixture items', () => {
    mountView(RegisterView);
    expect(text('register-count')).toBe('18 items, money in US$');
    for (const it of fixture.items) {
      const row = screen.getByTestId(`register-row-${it.id}`);
      expect(within(row).getByText(it.id)).toBeInTheDocument();
      expect(row.textContent).toContain(String(it.unitCost));
    }
  });

  it('criticality and ABC', () => {
    mountView(CriticalityAbcView);
    const crit = inv.criticality({ ...policy.criticality, items: fixture.items.map(pick(['id', 'name', 'scores'])) });
    for (const it of crit.items) {
      expect(text(`crit-score-${it.id}`)).toBe(fmtNum(it.weightedScore, 2));
      expect(text(`crit-class-${it.id}`)).toBe(it.class);
      expect(screen.getByTestId(`crit-row-${it.id}`).textContent).toContain(it.reason);
    }
    Object.entries(crit.counts).forEach(([k, n]) => expect(text(`crit-count-${k}`)).toBe(`${n} items`));
    const abc = inv.abcClassification({ ...policy.abc, items: fixture.items.map(pick(['id', 'name', 'annualUsage', 'unitCost'])) });
    expect(text('abc-total')).toBe(fmtNum(abc.totalAnnualValue, 2));
    for (const it of abc.items) {
      expect(text(`abc-value-${it.id}`)).toBe(fmtNum(it.annualValue, 2));
      expect(text(`abc-cum-${it.id}`)).toBe(fmtPct(it.cumulativePct, 2));
      expect(text(`abc-class-${it.id}`)).toBe(it.class);
    }
    expect(text('abc-summary-A')).toBe(`${abc.summary.A.count} items, ${fmtPct(abc.summary.A.valueSharePct)} of value`);
  });

  it('EOQ and quantity discounts', () => {
    mountView(EoqView);
    const e = inv.eoq(strip(cases.eoq));
    expect(text('eoq-eoq')).toBe(fmtNum(e.eoq, 2));
    expect(text('eoq-quantity')).toBe(fmtNum(e.quantity, 2));
    expect(text('eoq-orders')).toBe(fmtNum(e.ordersPerYear, 2));
    expect(text('eoq-cost')).toBe(fmtNum(e.relevantCost, 2));
    expect(text('eoq-cost-at-eoq')).toBe(fmtNum(e.relevantCostAtEoq, 2));
    expect(text('eoq-penalty')).toBe(fmtPct(e.roundingPenaltyPct, 3));
    expect(text('eoq-basis-reason')).toBe(e.reason);
    const q = inv.quantityDiscount(strip(cases.quantityDiscount));
    expect(text('discount-quantity')).toBe(fmtNum(q.quantity, 2));
    expect(text('discount-total')).toBe(fmtNum(q.totalCost, 2));
    expect(text('discount-saving')).toBe(fmtNum(q.savingsAgainstNoDiscount, 2));
    expect(text('discount-basis-reason')).toBe(q.reason);
    q.candidates.forEach((c) => expect(screen.getByTestId(`discount-row-${c.band}`).textContent).toContain(c.reason));
  });

  it('safety stock, normal and Poisson', () => {
    mountView(SafetyStockView);
    const s = inv.safetyStock(strip(cases.safetyStock));
    expect(text('safety-k')).toBe(fmtNum(s.safetyFactor, 4));
    expect(text('safety-sigma')).toBe(fmtNum(s.sigma, 4));
    expect(text('safety-ss')).toBe(fmtNum(s.safetyStock, 4));
    expect(text('safety-level-out')).toBe(fmtNum(s.level, 4));
    expect(text('safety-held')).toBe(fmtNum(s.levelRounded, 2));
    expect(text('safety-achieved')).toBe(fmtNum(s.achievedCycleService, 4));
    expect(text('safety-fill')).toBe(fmtNum(s.achievedFillRate, 4));
    expect(text('safety-basis-reason')).toBe(s.reason);
    const p = inv.poissonStock(strip(cases.poissonStock));
    expect(text('poisson-level-out')).toBe(String(p.level));
    expect(text('poisson-mean')).toBe(fmtNum(p.mean, 4));
    expect(text('poisson-achieved')).toBe(fmtNum(p.achievedCycleService, 6));
    expect(text('poisson-short')).toBe(fmtNum(p.expectedShortPerCycle, 6));
    expect(text('poisson-fill')).toBe('needs an order quantity');
    expect(text('poisson-basis-reason')).toBe(p.reason);
  });

  it('insurance spares', () => {
    mountView(InsuranceSparesView);
    const r = inv.insuranceSpares(strip(cases.insuranceSpares));
    expect(text('spares-best')).toBe(String(r.spares));
    expect(text('spares-total')).toBe(fmtNum(r.totalCost, 2));
    expect(text('spares-mean')).toBe(fmtNum(r.meanOutstanding, 6));
    r.options.forEach((o) => expect(text(`spares-total-${o.spares}`)).toBe(fmtNum(o.totalCost, 2)));
    expect(text('spares-basis-reason')).toBe(r.reason);
    expect(screen.queryByTestId('spares-limit')).toBeNull();
  });

  it('lead-time risk, with P90 labelled as the low figure', () => {
    mountView(LeadTimeRiskView);
    const r = inv.leadTimeRisk(strip(cases.leadTimeRisk));
    expect(text('lt-stockout')).toBe(fmtNum(r.probabilityOfStockout, 6));
    expect(text('lt-csl')).toBe(fmtNum(r.cycleServiceLevel, 6));
    expect(text('lt-short')).toBe(fmtNum(r.expectedShortPerCycle, 6));
    expect(text('lt-rop-service')).toBe(fmtNum(r.reorderPointForService, 4));
    for (const k of ['mean', 'p90', 'p50', 'p10', 'min', 'max']) {
      expect(text(`lt-stat-days-${k}`)).toBe(fmtNum(r.leadTime[k], 4));
      expect(text(`lt-stat-ltd-${k}`)).toBe(fmtNum(r.leadTimeDemand[k], 4));
    }
    expect(screen.getByTestId('lt-row-p90').textContent).toContain('P90 (low, the 10th percentile)');
    expect(screen.getByTestId('lt-row-p10').textContent).toContain('P10 (high, the 90th percentile)');
    // Low to high on screen, as the convention orders outcome cases.
    expect(r.leadTimeDemand.p90).toBeLessThan(r.leadTimeDemand.p10);
    expect(text('lt-definition')).toContain(r.percentileDefinition);
    expect(text('leadtime-basis-reason')).toBe(r.reason);
  });

  it('slow-moving and obsolete', () => {
    mountView(SlowMovingView);
    const r = inv.slowMoving({
      ...policy.slowMoving,
      items: fixture.items.map(pick(['id', 'name', 'onHand', 'unitCost', 'monthsSinceLastIssue', 'monthlyUsage'])),
    });
    expect(text('slow-stock')).toBe(fmtNum(r.totalStockValue, 2));
    expect(text('slow-writedown')).toBe(fmtNum(r.totalWriteDown, 2));
    expect(text('slow-excess-count')).toBe(String(r.excessCount));
    for (const it of r.items) {
      expect(text(`slow-band-${it.id}`)).toBe(it.band);
      expect(text(`slow-wd-${it.id}`)).toBe(fmtNum(it.writeDown, 2));
      expect(screen.getByTestId(`slow-row-${it.id}`).textContent).toContain(it.reason);
    }
  });
});

describe('refusals and edits', () => {
  it('prints the engine refusal word for word on a blank study', () => {
    mountView(EoqView, defaultInputs());
    expect(text('eoq-refusal-message')).toBe(inv.eoq({}).error);
    expect(text('discount-refusal-message')).toBe(inv.quantityDiscount({}).error);
  });

  it('reruns the engine when an input changes', () => {
    mountView(EoqView);
    fireEvent.change(screen.getByTestId('eoq-ordercost'), { target: { value: '900' } });
    const e = inv.eoq({ ...strip(cases.eoq), orderCost: 900 });
    expect(text('eoq-eoq')).toBe(fmtNum(e.eoq, 2));
  });

  it('refuses a service level of 1 in the engine\'s words', () => {
    mountView(SafetyStockView);
    fireEvent.change(screen.getByTestId('safety-level'), { target: { value: '1' } });
    expect(text('safety-refusal-message')).toBe(inv.safetyStock({ ...strip(cases.safetyStock), serviceLevel: 1 }).error);
  });
});

describe('the page', () => {
  const mount = () => render(<MemoryRouter><MaterialsSparesPlanner /></MemoryRouter>);

  it('mounts blank with the saved-study rail, the help guide and the engine commit', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: /Materials & Spares Planner/i })).toBeInTheDocument();
    expect(screen.getByText('Saved study')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
    expect(text('engine-line')).toMatch(/petrolord-engines [0-9a-f]{7}, engines\/supplychain\/inventory.js/);
    expect(screen.getByTestId('empty-register')).toBeInTheDocument();
  });

  it('loads the Ekene demo', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('load-ekene'));
    expect(text('register-count')).toBe('18 items, money in US$');
    expect(text('engine-line')).toMatch(/^Ekene demo \(synthetic\)/);
  });

  it('refuses a pasted register with a column it does not read', async () => {
    mount();
    fireEvent.change(await screen.findByTestId('register-paste'), { target: { value: 'id,unitcosts\nA,1' } });
    fireEvent.click(screen.getByTestId('import-register'));
    expect(text('register-parse-error')).toMatch(/Column "unitcosts" is not one the planner reads/);
  });
});

describe('copy rule on the help text', () => {
  it('has no em dashes and none of the banned contrastives', () => {
    const all = helpContent.map((h) => `${h.title} ${h.content}`).join(' ');
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/rather than|instead of|, never|, not /i);
  });
});
