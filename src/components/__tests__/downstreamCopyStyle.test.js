/**
 * Copy style for the Midstream & Downstream module.
 *
 * WHY THIS EXISTS. The owner's rule for user-facing copy is no em dashes
 * and no en dashes. The Economics module has the same guard
 * (economicsHelpGuides.test.js); this is the equivalent for the ten M&D
 * apps, whose help guides and result panels carry a lot of prose.
 *
 * DS6 shipped one em dash in a result line and it was found by reading,
 * not by a test. This is that test.
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');

const DIRS = [
  'src/components/crudeassay',
  'src/components/blendoptimizer',
  'src/components/refineryplanning',
  'src/components/modularrefinery',
  'src/components/terminaldepot',
  'src/components/fuelpricing',
  'src/components/lpgcng',
  'src/components/energyefficiency',
  'src/components/carbonabatement',
  'src/components/flaretovalue',
];

const PAGES = [
  'CrudeAssayBlendingStudio', 'ProductBlendingOptimizer', 'RefineryPlanningStudio',
  'ModularRefineryStudio', 'TerminalDepotStudio', 'FuelPricingStudio',
  'LpgCngRolloutStudio', 'EnergyEfficiencyStudio', 'CarbonAbatementStudio',
  'FlareToValueStudio',
].map((n) => `src/pages/apps/${n}.jsx`);

const collect = () => {
  const files = [];
  DIRS.forEach((d) => {
    const dir = path.join(root, d);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir)
      .filter((f) => f.endsWith('.jsx') || f.endsWith('.js'))
      .forEach((f) => files.push(path.join(d, f)));
  });
  PAGES.forEach((p) => {
    if (fs.existsSync(path.join(root, p))) files.push(p);
  });
  return files;
};

describe('Midstream & Downstream copy style', () => {
  const files = collect();

  it('finds the module\'s component and page files', () => {
    // A guard that scans nothing passes vacuously, which is worse than no
    // guard at all.
    expect(files.length).toBeGreaterThan(20);
  });

  it('uses no em dashes or en dashes anywhere in the module', () => {
    const offenders = [];
    files.forEach((rel) => {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      text.split('\n').forEach((line, i) => {
        if (/[–—]/.test(line)) {
          offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 100)}`);
        }
      });
    });
    expect(offenders).toEqual([]);
  });
});
