// NextGen Expert bridge codes: which quoted app a code discounts.
// generate-quote used to compare the code's suite_module with
// master_apps.module (a display name), so a code for a multi-word module
// ('midstream-downstream', 'data-ai', 'process-safety') discounted nothing.

import fs from 'fs';
import path from 'path';
import { bridgeCoversApp } from '../bridge-scope.ts';

// modules.slug -> master_apps.module display name, as the live catalogue
// and the seed migrations have them (src/data/suiteCatalog.js lists the ten).
const SUITE_MODULES: Array<[string, string]> = [
  ['geoscience', 'Geoscience'],
  ['reservoir', 'Reservoir'],
  ['drilling', 'Drilling'],
  ['production', 'Production'],
  ['facilities', 'Facilities'],
  ['economics', 'Economics'],
  ['assurance', 'Assurance'],
  ['process-safety', 'Process Safety'],
  ['midstream-downstream', 'Midstream & Downstream'],
  ['data-ai', 'Data & AI'],
];

// The comparison generate-quote made before this fix.
const legacyMatch = (suiteModule: string, appModuleName: string) =>
  String(appModuleName || '').toLowerCase() === String(suiteModule).toLowerCase();

describe('bridgeCoversApp', () => {
  test('a code for a module covers that module\'s apps and no other module\'s', () => {
    for (const [codeSlug] of SUITE_MODULES) {
      for (const [appSlug, appName] of SUITE_MODULES) {
        expect(bridgeCoversApp(codeSlug, appSlug, appName)).toBe(codeSlug === appSlug);
      }
    }
  });

  test('every code the old display-name comparison honoured is still honoured', () => {
    const codes = ['geoscience', 'reservoir', 'drilling', 'production', 'facilities', 'economics', 'assurance', 'Geoscience'];
    let honoured = 0;
    for (const code of codes) {
      for (const [appSlug, appName] of SUITE_MODULES) {
        if (legacyMatch(code, appName)) {
          honoured += 1;
          expect(bridgeCoversApp(code, appSlug, appName)).toBe(true);
        }
      }
    }
    expect(honoured).toBe(codes.length); // one module each, nothing vacuous
  });

  test('multi-word modules now match on their slug', () => {
    expect(bridgeCoversApp('midstream-downstream', 'midstream-downstream', 'Midstream & Downstream')).toBe(true);
    expect(bridgeCoversApp('data-ai', 'data-ai', 'Data & AI')).toBe(true);
    expect(bridgeCoversApp('process-safety', 'process-safety', 'Process Safety')).toBe(true);
  });

  test('negative control: the old comparison misses those same codes', () => {
    expect(legacyMatch('midstream-downstream', 'Midstream & Downstream')).toBe(false);
    expect(legacyMatch('data-ai', 'Data & AI')).toBe(false);
    expect(legacyMatch('process-safety', 'Process Safety')).toBe(false);
  });

  test('Academy module keys that are not Suite slugs match nothing', () => {
    for (const code of ['supply_chain', 'data_ai', 'commercial_trading', 'energy_transition', 'hse']) {
      for (const [appSlug, appName] of SUITE_MODULES) {
        expect(bridgeCoversApp(code, appSlug, appName)).toBe(false);
      }
    }
  });

  test('case and whitespace do not matter', () => {
    expect(bridgeCoversApp(' Data-AI ', 'data-ai', 'Data & AI')).toBe(true);
    expect(bridgeCoversApp('GEOSCIENCE', 'geoscience', 'Geoscience')).toBe(true);
  });

  test('an app without a module slug falls back to its display name', () => {
    expect(bridgeCoversApp('geoscience', undefined, 'Geoscience')).toBe(true);
    expect(bridgeCoversApp('geoscience', null, 'Reservoir')).toBe(false);
  });

  test('an empty code scope covers nothing', () => {
    expect(bridgeCoversApp('', 'geoscience', 'Geoscience')).toBe(false);
    expect(bridgeCoversApp(null, undefined, '')).toBe(false);
  });
});

describe('generate-quote wiring', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'generate-quote', 'index.ts'),
    'utf8',
  );

  test('the app loop matches a bridge code on the module slug', () => {
    expect(src).toMatch(/bridgeCoversApp\(bridge\.suite_module, moduleSlugById\[app\.module_id\], app\.module\)/);
    expect(src).not.toMatch(/String\(app\.module \|\| ''\)\.toLowerCase\(\) === String\(bridge\.suite_module\)/);
  });

  test('module slugs are loaded for a bridge quote with no module selected', () => {
    expect(src).toMatch(/if \(selectedModuleSlugs\.length > 0 \|\| bridge\) \{/);
  });
});
