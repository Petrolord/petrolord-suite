/**
 * The naming wave gate (owner decision 2026-09-14).
 *
 * The Designer used to label two different ratios "effective tax rate" and
 * "Gov Take (%)". The headline is now government take, the second metric is
 * government share of net revenue, both are defined once in the shared
 * fiscalConventions module, every appearance states its basis, and the
 * headline comes first and larger.
 *
 * 1. No Designer source, and nothing the Designer renders or exports, says
 *    "effective tax rate" unqualified. Qualified means preceded by "minimum "
 *    (a different, statutory quantity) or quoted as an old label with
 *    "labelled", "labeled", "called" or "formerly" just before it.
 * 2. The summary renders government take before government share of net
 *    revenue, larger, with the shared definitions on hover and in the
 *    footnote, and every "government take" it prints carries its basis.
 * 3. No verdict the engine hands the Designer names either old term.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, within } from '@testing-library/react';
import { runFiscalComparison } from '@/utils/fiscalDesignerCalculations';
import {
  FISCAL_METRICS, GOVERNMENT_CASH_FLOW, metricDefinition, metricLabel,
} from '@/utils/fiscalConventions';
import ResultsPanel from '../ResultsPanel';

jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const React = require('react');
  const ResponsiveContainer = ({ children }) => React.cloneElement(children, { width: 800, height: 360 });
  return { ...actual, ResponsiveContainer };
});

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

const ROOT = path.join(__dirname, '../../../..');
const G = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'packages/engines/test-data/economics/goldens/fiscal_cases.json'), 'utf8',
));

/** Every unqualified "effective tax rate" in a text, with its context. */
export const unqualifiedEtr = (text) => {
  const hits = [];
  const re = /effective tax rate/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 48), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 1);
    const minimum = /minimum\s+$/i.test(before);
    const quotedOldLabel = /["“]$/.test(before) && /["”]/.test(after)
      && /(labell?ed|called|formerly)\b[^.]*$/i.test(before);
    if (!minimum && !quotedOldLabel) hits.push(text.slice(Math.max(0, m.index - 40), m.index + 60));
  }
  return hits;
};

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(full);
  return /\.(jsx?|tsx?)$/.test(e.name) ? [full] : [];
});

describe('the qualifier rule', () => {
  it('flags an unqualified use (negative control) and accepts the two qualified forms', () => {
    expect(unqualifiedEtr('The effective tax rate here is 42 percent.')).toHaveLength(1);
    expect(unqualifiedEtr('Gov take (%) is an effective tax rate.')).toHaveLength(1);
    expect(unqualifiedEtr('The PIA minimum effective tax rate applies.')).toHaveLength(0);
    expect(unqualifiedEtr('Both used to be labelled "effective tax rate" on one screen.')).toHaveLength(0);
    expect(unqualifiedEtr('It was formerly called "effective tax rate".')).toHaveLength(0);
    // Quotes alone are not a qualifier.
    expect(unqualifiedEtr('The "effective tax rate" column.')).toHaveLength(1);
  });
});

describe('no unqualified "effective tax rate" in the Designer', () => {
  const sources = [
    ...walk(path.join(ROOT, 'src/components/fiscaldesigner')),
    path.join(ROOT, 'src/pages/apps/FiscalRegimeDesigner.jsx'),
    path.join(ROOT, 'src/utils/fiscalConventions.js'),
    path.join(ROOT, 'packages/engines/engines/economics/fiscalConventions.js'),
  ];

  it.each(sources.map((f) => [path.relative(ROOT, f), f]))('%s', (_rel, file) => {
    expect(unqualifiedEtr(fs.readFileSync(file, 'utf8'))).toEqual([]);
  });

  it('the scan covers the Designer components it must', () => {
    const names = sources.map((f) => path.basename(f));
    ['ResultsPanel.jsx', 'PriceShareChart.jsx', 'FiscalDesignerHelpGuide.jsx', 'InputPanel.jsx'].forEach((n) => expect(names).toContain(n));
  });

  it('the regime export carries regime definitions only, so it has no metric to name', () => {
    const page = fs.readFileSync(path.join(ROOT, 'src/pages/apps/FiscalRegimeDesigner.jsx'), 'utf8');
    const exportBlock = page.slice(page.indexOf('const exportData = {'), page.indexOf('JSON.stringify(exportData'));
    expect(exportBlock).toMatch(/regimes: regimes\.map/);
    expect(exportBlock).not.toMatch(/effectiveTaxRate|governmentTake|govTake|summary/);
  });
});

describe.each([
  'cmp_all_templates_default_project',
  'cmp_never_recovers',
  'cmp_angola_capex_x3',
])('the summary on %s', (id) => {
  let res;
  let view;
  beforeAll(async () => {
    const c = G.comparisons.find((x) => x.id === id);
    res = await runFiscalComparison({ projectInputs: c.project, regimes: c.regimes });
  });
  beforeEach(() => {
    view = render(<ResultsPanel results={res} />);
  });

  it('puts government take first and larger, with the shared definitions on hover', () => {
    const table = view.container.querySelector('table');
    const heads = [...table.querySelectorAll('thead th')];
    const headline = heads.findIndex((h) => h.dataset.metric === 'headline');
    const secondary = heads.findIndex((h) => h.dataset.metric === 'secondary');
    expect(headline).toBeGreaterThan(-1);
    expect(secondary).toBe(headline + 1);
    expect(heads[headline].textContent).toBe(`${metricLabel('governmentTake')}, %`);
    expect(heads[secondary].textContent).toBe(`${metricLabel('governmentShareOfNetRevenue')}, %`);
    expect(heads[headline].getAttribute('title')).toBe(metricDefinition('governmentTake'));
    expect(heads[secondary].getAttribute('title')).toBe(metricDefinition('governmentShareOfNetRevenue'));
    // Larger: the headline header and cells use a larger type step than the secondary.
    expect(heads[headline].className).toMatch(/text-base/);
    expect(heads[secondary].className).toMatch(/text-xs/);
    table.querySelectorAll('tbody tr').forEach((row) => {
      const cells = [...row.children];
      expect(cells[headline].className).toMatch(/text-lg/);
      expect(cells[secondary].className).toMatch(/text-sm/);
      expect(cells[headline].getAttribute('title')).toBe(metricDefinition('governmentTake'));
      expect(cells[secondary].getAttribute('title')).toBe(metricDefinition('governmentShareOfNetRevenue'));
    });
    expect(heads.map((h) => h.textContent)).toContain(`${GOVERNMENT_CASH_FLOW.title} ($MM)`);
  });

  it('prints the discounted variant labelled with its rate, and the definitions in the footnote', () => {
    const rate = res.summary[0].discountRatePct;
    const rows = view.container.querySelectorAll('tbody tr');
    rows.forEach((row) => expect(row.textContent).toContain(`discounted at ${rate} percent: `));
    const foot = within(view.container).getByTestId('fiscal-metric-definitions');
    expect(foot.textContent).toContain(metricDefinition('governmentTake'));
    expect(foot.textContent).toContain(metricDefinition('governmentShareOfNetRevenue'));
    expect(foot.textContent).toContain(GOVERNMENT_CASH_FLOW.definition);
  });

  it('never prints a zero for a take that does not exist', () => {
    const rows = [...view.container.querySelectorAll('tbody tr')];
    res.summary.forEach((s, i) => {
      if (s.governmentTakeState === 'undefined') {
        expect(rows[i].querySelector('[data-metric="headline"]').textContent).toMatch(/^none, project uneconomic/);
      }
    });
  });

  it('says no unqualified "effective tax rate", and every government take it prints states its basis', () => {
    const titles = [...view.container.querySelectorAll('[title]')].map((e) => e.getAttribute('title')).join('\n');
    const text = `${view.container.textContent}\n${titles}`;
    expect(unqualifiedEtr(text)).toEqual([]);
    // Every "government take" is followed by its basis in parentheses; a bare
    // one (no parenthesis) fails.
    const takes = text.match(/government take(?: \([^)]*\))?/gi) || [];
    expect(takes.length).toBeGreaterThan(0);
    takes.forEach((t) => expect(t).toMatch(/^government take \((undiscounted|discounted at [0-9.]+ percent)\)$/i));
  });

  it('hands the Designer verdicts that name neither old term', () => {
    res.insights.forEach((i) => {
      expect(unqualifiedEtr(i.text)).toEqual([]);
      expect(i.text).not.toMatch(/government share/i);
    });
  });
});

describe('the conventions the Designer shows are the engine module', () => {
  it('imports one definition per metric, not a copy', () => {
    const shim = fs.readFileSync(path.join(ROOT, 'src/utils/fiscalConventions.js'), 'utf8');
    expect(shim).toMatch(/export \* from '\.\.\/\.\.\/packages\/engines\/engines\/economics\/fiscalConventions\.js'/);
    expect(FISCAL_METRICS.governmentTake.role).toBe('headline');
    // No Designer file restates a definition by hand.
    walk(path.join(ROOT, 'src/components/fiscaldesigner')).forEach((f) => {
      const src = fs.readFileSync(f, 'utf8');
      expect(src).not.toContain(FISCAL_METRICS.governmentTake.definition);
      expect(src).not.toContain(FISCAL_METRICS.governmentShareOfNetRevenue.definition);
    });
  });
});
