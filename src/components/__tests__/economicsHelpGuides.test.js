// Guards for the Economics module in-app help guides (Economics E2).
//
// Same shape as the Reservoir guard, and for the same two reasons: help
// content drifts behind the app as later phases ship, and the owner copy rule
// (no em dashes) needs enforcing somewhere that fails loudly. Both checks read
// the source rather than the rendered output, because these guides are
// accordions and closed sections are not mounted.
//
// The Economics guides carry a third duty. This module had five parallel
// fiscal engines and a documented discounting convention clash, so a guide
// that quietly stops saying which tier it belongs to is a regression in its
// own right. The coverage patterns below pin those statements down.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

const GUIDES = {
  'Probabilistic Breakeven Analyzer': 'components/breakevenanalyzer/BreakevenHelpGuide.jsx',
  'Value of Information Analyzer': 'components/voianalyzer/VoiHelpGuide.jsx',
  'Fiscal Regime Designer': 'components/fiscaldesigner/FiscalDesignerHelpGuide.jsx',
  'Capital Portfolio Studio': 'components/capitalportfoliostudio/PortfolioHelpGuide.jsx',
  'Decision Tree Builder': 'components/decisiontree/DecisionTreeHelpGuide.jsx',
  'Decision Studio': 'components/decisionstudio/DecisionStudioHelpGuide.jsx',
};

// Phrases that pin a shipped behaviour into its guide.
const COVERAGE = {
  'Probabilistic Breakeven Analyzer': [
    /saved study/i,
    /auto-save/i,
    // E1: the seed, the percentile fit and the screening tier are the three
    // things a user has to know to trust or challenge a number from this app.
    /seed/i,
    /reproduce/i,
    /percentiles/i,
    /38 and 62 percent/i,
    /mid-year discounting/i,
    /Petroleum Economics Studio/i,
    /sampled independently/i,
  ],
  'Value of Information Analyzer': [
    /saved study/i,
    /posteriors/i,
    // The D3 Bayes-consistency check, and the EVPI ceiling.
    /consistency/i,
    /EVPI/,
    /ceiling|hard ceiling/i,
    /risk neutral/i,
  ],
  'Fiscal Regime Designer': [
    /regime sandbox/i,
    /R factor/i,
    /cost recovery/i,
    // E1's two fixes, stated so a reader knows what the model now does.
    /cost oil/i,
    /carries forward/i,
    /contractor take plus government take equals revenue minus costs/i,
    // The year-end vs mid-year convention gap, quantified.
    /year end/i,
    /mid year/i,
    /4\.9 percent/,
    /Petroleum Economics Studio/i,
  ],
  'Capital Portfolio Studio': [
    /knapsack/i,
    /efficient frontier|frontier/i,
    /risked expected value/i,
    /quantized/i,
    // The independence assumption is the one that most often bites.
    /independent/i,
    /correlated/i,
  ],
  'Decision Tree Builder': [
    /rolling back|rolled back|rollback/i,
    /decision node/i,
    /chance node/i,
    /sum to one/i,
    /Monte Carlo run/i,
    /risk neutral/i,
  ],
  'Decision Studio': [
    /provenance/i,
    /seed/i,
    /re-optimized|re-optimised/i,
    /screening grade|screening-grade/i,
  ],
};

// Claims that must not appear. These are the module's standing hazards: no
// guide may present a screening tool as the fiscal source of truth, and none
// may promise reproducibility the engine does not provide.
const FORBIDDEN = {
  'Probabilistic Breakeven Analyzer': [
    /full fiscal/i,
    /PIA 2021/,
  ],
  'Fiscal Regime Designer': [
    /source of truth for/i,
    /full Nigerian fiscal math lives here/i,
  ],
};

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

describe('Economics help guides', () => {
  test.each(Object.entries(GUIDES))('%s guide exists', (_name, relative) => {
    expect(fs.existsSync(path.join(ROOT, relative))).toBe(true);
  });

  test.each(Object.entries(GUIDES))('%s carries no em dashes (owner copy rule)', (_name, relative) => {
    const offending = read(relative)
      .split('\n')
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => line.includes('—'));
    expect(offending).toEqual([]);
  });

  test.each(Object.entries(GUIDES))('%s guide is wired into its app', (name, relative) => {
    // A guide nobody can open is not help. Every guide must be imported by a
    // routed page; this catches the file that gets written and never mounted.
    const base = path.basename(relative, '.jsx');
    const pages = fs.readdirSync(path.join(ROOT, 'pages/apps'))
      .filter((f) => f.endsWith('.jsx'))
      .map((f) => read(path.join('pages/apps', f)));
    expect(pages.some((src) => src.includes(base))).toBe(true);
  });

  test.each(Object.entries(COVERAGE))('%s guide documents its shipped surface', (name, patterns) => {
    const source = read(GUIDES[name]);
    for (const pattern of patterns) {
      expect(source).toMatch(pattern);
    }
  });

  test.each(Object.entries(FORBIDDEN))('%s guide makes no overclaim', (name, patterns) => {
    const source = read(GUIDES[name]);
    for (const pattern of patterns) {
      expect(source).not.toMatch(pattern);
    }
  });

  test('every economics guide states which fiscal tier it belongs to', () => {
    // The module runs a screening tier and a full-fiscal tier. Any guide for
    // an app that computes money must say which one the user is looking at,
    // because that is the difference between a number for a screening deck
    // and a number for a sanction case.
    const moneyApps = [
      'Probabilistic Breakeven Analyzer',
      'Fiscal Regime Designer',
    ];
    for (const name of moneyApps) {
      expect(read(GUIDES[name])).toMatch(/screening/i);
    }
  });
});
