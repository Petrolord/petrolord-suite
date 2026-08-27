// Guards for the Reservoir module in-app help guides.
//
// Two things kept going wrong before this test existed. Help content drifted
// behind the app as later phases shipped, and the owner copy rule (no em
// dashes) was enforced only in the drilling guides. Both checks read the
// source rather than the rendered output, because these guides are accordions
// and closed sections are not mounted.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

const GUIDES = {
  'Decline Curve Analysis': 'components/declineCurve/DCAHelpContent.jsx',
  'Waterflood Design Studio': 'components/waterflooddesign/WDSHelpContent.jsx',
  'Material Balance Studio': 'components/reservoirbalance/MbsHelpContent.jsx',
  'Well Test Analysis Studio': 'components/welltest/WTSHelpContent.jsx',
  'SCAL Studio': 'components/scalstudio/ScalHelpContent.jsx',
  'Fluid Systems Studio': 'components/fluidstudio/FluidStudioHelpGuide.jsx',
  'Reservoir Simulation Studio': 'components/simstudio/SimHelpGuide.jsx',
  'VRR Monitor': 'components/reservoir/VrrHelpGuide.jsx',
  'Recovery Factor Estimator': 'components/reservoir/RecoveryFactorHelpGuide.jsx',
  'EOR Screening': 'pages/apps/EorScreeningHelpGuide.jsx',
  'Forecast Scenario Hub': 'pages/apps/ForecastScenarioHubHelpGuide.jsx',
  'Risked Reserves Valuation': 'pages/apps/RiskedReservesHelpGuide.jsx',
  'Help guide layout': 'components/helpguide/HelpGuideLayout.jsx',
};

// Phrases that pin a shipped capability into its guide. Each entry is a
// feature that was live in the app while the guide said nothing about it, or
// said something untrue. Adding a feature means adding its phrase here.
const COVERAGE = {
  'Decline Curve Analysis': [
    /Production Stream/i,
    /Forecast Results/i,
    /well grouping/i,
    /group rollup/i,
    /Integration panel/i,
    /gasRate/,
    // Live defect: the Monte Carlo curve consumes the per-day fitted decline
    // as if it were per year, so probabilistic EUR is ~25x high. The guide
    // must keep warning until the engine fix lands.
    /probabilistic EUR is overstated/i,
    // The Integration panel cards report success but transmit nothing.
    /does not transmit anything yet/i,
    // Fits are keyed by stream, so switching wells silently reattributes them.
    /belongs to the stream rather than to the well/i,
  ],
  'Waterflood Design Studio': [
    /SCAL Studio/i,
    /Well Test Analysis Studio/i,
    /diagnostics rail/i,
  ],
  'Material Balance Studio': [
    /Cole plot/i,
    /Campbell plot/i,
    /Ramagost-Farshad/i,
    /Prefill from correlations/i,
    /Beal-Standing/i,
  ],
  'Well Test Analysis Studio': [
    /dual porosity with a sealing fault/i,
    /diagnostics rail/i,
    /Fluid Systems Studio/i,
    /rate transient results/i,
  ],
  'SCAL Studio': [/PNG/i, /merges them into the project/i],
  'Reservoir Simulation Studio': [/WCONINJH/, /Interval volume/i],
  'VRR Monitor': [/PVT override/i, /weakest pattern/i],
  'Recovery Factor Estimator': [/gravity drainage/i, /water-drive gas/i, /Sample button/i],
  // The three guides written for apps that previously had none. Each list
  // pins the trap that made the guide necessary in the first place.
  'EOR Screening': [
    /Taber/,
    /unscored/i,
    /Qualification requires a clean sheet/i,
    /Immiscible gas nearly always qualifies/i,
    /inclusive/i,
  ],
  'Forecast Scenario Hub': [
    /nominal, not effective/i,
    /Clearing a box writes zero/i,
    /Time to limit is ambiguous/i,
    /no capex/i,
    /Import from Forecast Scenario Hub/i,
  ],
  'Risked Reserves Valuation': [
    /low bound/i,
    /petroleum convention/i,
    /steeper decline raises NPV/i,
    /chance of a positive NPV/i,
    /size and not direction/i,
  ],
};

// Claims that were in a guide and were not true. Pinned so they cannot come
// back on a careless revert.
const FORBIDDEN = {
  'Decline Curve Analysis': [/Ctrl\+Z/, /Ctrl\+S/, /Keyboard Shortcuts/i],
  'Material Balance Studio': [/water influx history/i],
  'Well Test Analysis Studio': [/Oilfield units throughout/i],
  'Reservoir Simulation Studio': [/3D grid visualization and compositional runs are not included/i],
};

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

describe('Reservoir help guides', () => {
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

  test.each(Object.entries(COVERAGE))('%s guide documents its shipped surface', (name, patterns) => {
    const source = read(GUIDES[name]);
    for (const pattern of patterns) {
      expect(source).toMatch(pattern);
    }
  });

  test.each(Object.entries(FORBIDDEN))('%s guide has no retired claims', (name, patterns) => {
    const source = read(GUIDES[name]);
    for (const pattern of patterns) {
      expect(source).not.toMatch(pattern);
    }
  });
});
