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
  'AFE Cost Control Manager': 'components/afe/AfeHelpGuide.jsx',
  // EC6-1: this app shipped with no guide at all, which is how it came to be
  // the one place a user could put invented figures into a document without
  // being told.
  'Technical Report Autopilot': 'components/reportautopilot/ReportAutopilotHelpGuide.jsx',
  'FDP Accelerator': 'components/fdp/FdpHelpGuide.jsx',
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
    /ceiling/i,
    /risk neutral/i,
    // EC4-0: what the repaired engine does with bad and contradictory inputs.
    /refuses to run/i,
    /withholds EMV with information/i,
    /for inputs that pass the consistency check/i,
  ],
  'Fiscal Regime Designer': [
    /regime sandbox/i,
    /R factor/i,
    /cost recovery/i,
    // E1's two fixes, stated so a reader knows what the model now does.
    /cost oil/i,
    /carries forward/i,
    /contractor net cash flow plus government cash flow equals revenue minus costs/i,
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
    // EC5-0: the risk cards are a seeded Monte Carlo, the grid resolution is
    // shown, and an overshoot of the limit is flagged.
    /seeded Monte Carlo/i,
    /seed/i,
    /resolution is reported alongside the answer/i,
    /overshoot the limit by up to half a cell per project/i,
    /flags it/i,
    /P90 is the low case/i,
  ],
  'Decision Tree Builder': [
    /rolling back|rolled back|rollback/i,
    /decision node/i,
    /chance node/i,
    /sum to one/i,
    /Monte Carlo run/i,
    /risk neutral/i,
    // EC4-0: a linked payoff is a stored copy (DecisionTreeBuilder pickMcRun).
    /stores a copy/i,
    /relink/i,
  ],
  'Decision Studio': [
    /provenance/i,
    /seed/i,
    /re-optimized|re-optimised/i,
    /screening grade|screening-grade/i,
    // EC4-0: the true statements that replaced four false ones.
    /sits highest has the greatest chance of losing money/i,
    /relinked in the Decision Tree Builder/i,
    /does not grade an analysis/i,
    /email address you are signed in with/i,
  ],
  // EC5-0: the wizard window, the one EAC rule, SPI Not started, partners.
  'AFE Cost Control Manager': [
    /its window, a start date and an end date/i,
    /refuses an end date before the start date/i,
    /one estimate at completion rule/i,
    /budget less that forecast/i,
    /Not started/,
    /schedule index is shown as unavailable/i,
    /negative working interest is refused/i,
    /operator carries 100 percent/i,
    /Integrations tab connects to nothing/i,
  ],
  // EC6-1: the three things a user has to know before sending a generated
  // report to anyone.
  'Technical Report Autopilot': [
    /written by an OpenAI model|written by a language model/i,
    /Reported figures/,
    /Check every figure/i,
    /Max Pages/,
    /no engineering calculation/i,
  ],
  // EC6-1: the FDP guide has to say where the economics come from and what
  // the critical path is computed from.
  'FDP Accelerator': [
    /selected concept/i,
    /selected scenario/i,
    /list of what is missing/i,
    /critical path method/i,
    /float/i,
    /Petroleum Economics Studio/i,
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
  // EC4-0 (owner decision 2026-09-14): false claims removed from these three
  // guides. Pinned here so they cannot come back.
  'Value of Information Analyzer': [
    // It did report a VOI built on contradicting numbers, before engines #177.
    /rather than reporting a value of information built on numbers that contradict each other/i,
    // EVPI bounds VOI only for Bayes-consistent inputs.
    /hard ceiling/i,
  ],
  'Decision Tree Builder': [
    // Nothing re-reads a linked run; the payoff is a copy taken at link time.
    /re-solved against it/i,
  ],
  'Decision Studio': [
    // Every S-curve meets NPV = 0 at the same x; the highest one there is worst.
    /crosses zero furthest to the right/i,
    // Linked payoffs inside a tree are exactly such a cached number.
    /rather than a cached number/i,
    // No provenance string grades anything as screening grade.
    /label(l)?ed as such/i,
    // The brief uses the signed-in email; there is no name field.
    /and your name/i,
  ],
  // EC5-0: claims the repaired portfolio engine made false.
  'Capital Portfolio Studio': [
    /cannot exceed the limit/i,
    /without exceeding your capital limit/i,
    /normal approximation/i,
    /approximated as a normal/i,
    /normal distribution/i,
  ],
  // EC5-0: an entered zero forecast is not used, and SPI is not measured
  // against the calendar without an as-of date.
  'AFE Cost Control Manager': [
    /Where you have entered a forecast for a line, that is used/i,
    /more work per pound/i,
    /live link to (PM Pro|the rig|a rig)/i,
  ],
  // EC6-1: what this app must never claim.
  'Technical Report Autopilot': [
    /GPT-4/,
    /verified against/i,
    /reads your data/i,
  ],
  'FDP Accelerator': [
    // The Economics tab no longer runs an illustrative profile silently.
    /illustrative placeholders, not this project/i,
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
    // A guide nobody can open is not help. Every guide must be imported by
    // something other than itself; this catches the file that gets written
    // and never mounted. EC6-1: the walk covers the whole tree, because the
    // FDP guide is mounted from its studio's top navigation rather than
    // directly from the routed page.
    const base = path.basename(relative, '.jsx');
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(full);
      return e.name.endsWith('.jsx') && full !== path.join(ROOT, relative) ? [full] : [];
    });
    const importers = walk(ROOT).filter((f) => fs.readFileSync(f, 'utf8').includes(base));
    expect(importers.length).toBeGreaterThan(0);
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

  test('the Decision Studio brief footer makes no screening-grade labelling claim (EC4-0)', () => {
    // The footer is printed on every exported PDF, so the false claim lived
    // there as well as in the guide.
    const model = read('components/decisionstudio/briefModel.js');
    expect(model).not.toMatch(/label(l)?ed as such/i);
    expect(model).toMatch(/footer: 'Prepared with Petrolord Decision Studio\. Every figure above carries its source and assumptions in the provenance line beneath its section\.'/);
  });

  test.each([
    'components/voianalyzer/ResultsPanel.jsx',
    'components/voianalyzer/DecisionTreePlot.jsx',
    'pages/apps/ValueOfInformationAnalyzer.jsx',
  ])('%s carries no em or en dashes (owner copy rule, EC4-0 surfaces)', (relative) => {
    const offending = read(relative).split('\n').filter((line) => /[–—]/.test(line));
    expect(offending).toEqual([]);
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
