// Casing & Tubing Design Studio (Drilling D6) acceptance: the
// /dev/casing-tubing harness mounts the REAL app on the in-memory backend
// seeded with the oracle golden two-section 9-5/8 design; the UI must
// reproduce the engine's answers — expectations recomputed here through the
// same pure ctRun service + vendored engines.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import {
  runAll, fmtSF, nToKN, buildGoldenCaseDoc,
} from '../src/pages/apps/CasingTubingDesignPro/services/ctRun.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const loadGolden = (name) => JSON.parse(fs.readFileSync(path.join(
  dirname, '..', 'packages', 'engines', 'test-data', 'drilling', 'goldens', name,
), 'utf8'));
const golden = loadGolden('tubular_cases.json');
const stations = loadGolden('geomech_cases.json').cases.find((c) => c.well === 'slant').stations;

const doc = buildGoldenCaseDoc(golden);
const results = runAll({ caseDoc: doc, stations });
const str = results.casing[0];
const kick = str.cases.find((c) => c.kind === 'gasKickBurst');
const ptest = str.cases.find((c) => c.kind === 'pressureTestBurst');

let worstForce = null;
let worstPackerSF = null;
for (const c of results.tubing.cases) {
  const f = c.loads.forces.totalN;
  if (worstForce == null || Math.abs(f) > Math.abs(worstForce)) worstForce = f;
  const sf = c.loads.packer.sf;
  if (sf != null && (worstPackerSF == null || sf < worstPackerSF)) worstPackerSF = sf;
}

test('harness reproduces the engine casing results off the UI', async ({ page }) => {
  await page.goto('/dev/casing-tubing');

  // Spine auto-loads: shoe TVD from the definitive trajectory.
  await expect(page.getByTestId('ct-shoe-tvd')).toContainText(
    String(Math.round(str.shoeTvdM)), { timeout: 20000 },
  );
  await expect(page.getByTestId('ct-ppfg-badge')).toContainText('Published');

  // Overall status + governing KPIs.
  await expect(page.getByTestId('ct-overall-status')).toContainText(results.kpis.overall);
  await expect(page.getByTestId('ct-kpi-burst')).toContainText(fmtSF(results.kpis.minBurst.value));
  await expect(page.getByTestId('ct-kpi-collapse')).toContainText(fmtSF(results.kpis.minCollapse.value));
  await expect(page.getByTestId('ct-kpi-triaxial')).toContainText(fmtSF(results.kpis.minTriaxial.value));
  await expect(page.getByTestId('ct-controlling-load')).toContainText(results.kpis.minCollapse.value < results.kpis.minBurst.value
    ? results.kpis.minCollapse.caseName : results.kpis.minBurst.caseName);

  // Casing tab: default case is the first casing load case (gas kick).
  await page.getByRole('tab', { name: /Casing Design/ }).click();
  await expect(page.getByTestId('ct-burst-sf-Upper')).toContainText(fmtSF(kick.sections[0].burstSF));
  await expect(page.getByTestId('ct-burst-sf-Lower')).toContainText(fmtSF(kick.sections[1].burstSF));
  await expect(page.getByTestId('ct-triaxial-sf-Upper')).toContainText(fmtSF(kick.sections[0].triaxSF));

  // Switch to the pressure test case and check the WARNING band.
  await page.getByTestId('ct-load-case-picker').click();
  await page.getByRole('option', { name: 'Pressure Test' }).click();
  await expect(page.getByTestId('ct-burst-sf-Lower')).toContainText(fmtSF(ptest.sections[1].burstSF));
  await expect(page.getByTestId('ct-string-status')).toContainText('WARNING');
});

test('tubing force system and erosional check match the engine', async ({ page }) => {
  await page.goto('/dev/casing-tubing');
  await expect(page.getByTestId('ct-shoe-tvd')).toBeVisible({ timeout: 20000 });

  await page.getByRole('tab', { name: /Tubing Design/ }).click();
  await expect(page.getByTestId('ct-tubing-total-force')).toContainText(
    `${nToKN(worstForce).toFixed(1)} kN`,
  );
  await expect(page.getByTestId('ct-packer-sf')).toContainText(fmtSF(worstPackerSF));
  await expect(page.getByTestId('ct-erosional-ve')).toContainText(
    results.tubing.erosional.veMs.toFixed(1),
  );
  await expect(page.getByTestId('ct-tubing-status')).toContainText(
    results.tubing.cases.some((c) => c.status === 'FAIL') ? 'FAIL' : 'WARNING',
  );
});

test('save, duplicate and dirty-state flow through the backend', async ({ page }) => {
  await page.goto('/dev/casing-tubing');
  await expect(page.getByTestId('ct-shoe-tvd')).toBeVisible({ timeout: 20000 });

  // Saved case starts clean.
  await expect(page.getByTestId('ct-save-case')).toBeDisabled();

  // Duplicate selects the copy.
  await page.getByTestId('ct-duplicate-case').click();
  await expect(page.getByTestId('ct-case-picker')).toContainText('(copy)', { timeout: 10000 });

  // Editing the environment marks dirty; Save persists and clears it.
  await page.getByTestId('ct-mud-density').fill('1500');
  await expect(page.getByTestId('ct-save-case')).toBeEnabled();
  await page.getByTestId('ct-save-case').click();
  await expect(page.getByTestId('ct-save-case')).toBeDisabled({ timeout: 10000 });

  // Switch back to the golden case and return: the edit survived the trip.
  await page.getByTestId('ct-case-picker').click();
  await page.getByRole('option', { name: 'Golden 9-5/8 Design', exact: true }).click();
  await page.getByTestId('ct-case-picker').click();
  await page.getByRole('option', { name: /copy/ }).click();
  await expect(page.getByTestId('ct-mud-density')).toHaveValue('1500');
});

test('manual PPFG edit switches provenance to manual', async ({ page }) => {
  await page.goto('/dev/casing-tubing');
  await expect(page.getByTestId('ct-ppfg-badge')).toContainText('Published', { timeout: 20000 });
  await page.getByTestId('ct-frac-emw').fill('1750');
  await expect(page.getByTestId('ct-ppfg-badge')).toContainText('Manual');
  await page.getByTestId('ct-ppfg-sync').click();
  await expect(page.getByTestId('ct-ppfg-badge')).toContainText('Published');
});
