// Completion Design Studio (Drilling D7) acceptance: the
// /dev/completion-design harness mounts the REAL app on the in-memory
// backend seeded with the oracle golden 3-1/2" completion in the 9-5/8" +
// 7" liner program; the UI must reproduce the engine's answers —
// expectations recomputed here through the same pure cdRun service +
// vendored engines.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import {
  runAll, buildGoldenCaseDoc, tubingSizingTable,
} from '../src/pages/apps/CompletionDesignStudio/services/cdRun.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const loadGolden = (name) => JSON.parse(fs.readFileSync(path.join(
  dirname, '..', 'packages', 'engines', 'test-data', 'drilling', 'goldens', name,
), 'utf8'));
const golden = loadGolden('completion_cases.json');
const stations = loadGolden('geomech_cases.json').cases.find((c) => c.well === 'slant').stations;

const IN = 0.0254;
const doc = buildGoldenCaseDoc(golden);
const res = runAll({ caseDoc: doc });

test('harness reproduces the engine clearance and volume results off the UI', async ({ page }) => {
  await page.goto('/dev/completion-design');

  // Builder tab: live stack-up from the engine.
  await expect(page.getByTestId('cd-string-bottom')).toContainText(
    String(Math.round(res.stack.bottomMdM)), { timeout: 20000 },
  );
  await expect(page.getByTestId('cd-banner')).toContainText(res.kpis.banner);

  // Checks tab: worst clearance, through-bore, volumes, space-out, erosional.
  await page.getByTestId('cd-tab-checks').click();
  await expect(page.getByTestId('cd-clearance-worst')).toContainText(res.clearance.worst.name);
  await expect(page.getByTestId('cd-clearance-worst')).toContainText(
    (res.clearance.worst.clearanceM * 1000).toFixed(1),
  );
  await expect(page.getByTestId('cd-clearance-worst-status')).toContainText(res.clearance.worst.status);
  await expect(page.getByTestId('cd-throughbore-min')).toContainText(
    (res.throughBore.minIdM / IN).toFixed(3),
  );
  await expect(page.getByTestId('cd-throughbore-ctrl')).toContainText(res.throughBore.controlling);
  await expect(page.getByTestId('cd-vol-capacity')).toContainText(res.volumes.stringCapacityM3.toFixed(2));
  await expect(page.getByTestId('cd-vol-annulus')).toContainText(res.volumes.annulusAbovePackerM3.toFixed(2));
  await expect(page.getByTestId('cd-spaceout-remaining')).toContainText(res.spaceOut.remainingM.toFixed(2));
  await expect(page.getByTestId('cd-spaceout-status')).toContainText(res.spaceOut.status);
  await expect(page.getByTestId('cd-erosional-ve')).toContainText(res.erosional.veMs.toFixed(2));
});

test('schematic draws the program and the BOM groups the tally', async ({ page }) => {
  await page.goto('/dev/completion-design');
  await expect(page.getByTestId('cd-string-bottom')).toBeVisible({ timeout: 20000 });

  // BOM on the builder tab: tubing grouped with the full run length.
  const bom = page.getByTestId('cd-bom');
  await expect(bom).toContainText('Tubing 3-1/2" EUE');
  await expect(bom).toContainText('nominal (verify vendor sheet)');

  await page.getByTestId('cd-tab-schematic').click();
  const schematic = page.getByTestId('cd-schematic');
  await expect(schematic).toBeVisible();
  await expect(schematic).toContainText('7" liner shoe 3000 m');
  await expect(schematic).toContainText(/Production packer 7" casing @ \d+ m/);
  await expect(schematic).toContainText('TD 3000 m');
});

test('duplicate, edit and save round-trip through the backend', async ({ page }) => {
  await page.goto('/dev/completion-design');
  await expect(page.getByTestId('cd-string-bottom')).toBeVisible({ timeout: 20000 });

  // Saved case starts clean: no Save button rendered.
  await expect(page.getByTestId('cd-save-case')).toHaveCount(0);

  await page.getByTestId('cd-duplicate-case').click();
  await expect(page.getByTestId('cd-case-Golden 3-1/2" Completion (copy)')).toBeVisible({ timeout: 10000 });

  // Edit a tubing length: stack-up moves, dirty appears; save persists.
  await page.getByTestId('cd-comp-len-0').fill('200');
  await expect(page.getByTestId('cd-string-bottom')).toContainText(
    String(Math.round(res.stack.bottomMdM + 50)),
  );
  await page.getByTestId('cd-save-case').click();
  await expect(page.getByTestId('cd-save-case')).toHaveCount(0, { timeout: 10000 });

  // Round trip: leave and return; the edit survived.
  await page.getByTestId('cd-case-Golden 3-1/2" Completion').click();
  await expect(page.getByTestId('cd-string-bottom')).toContainText(String(Math.round(res.stack.bottomMdM)));
  await page.getByTestId('cd-case-Golden 3-1/2" Completion (copy)').click();
  await expect(page.getByTestId('cd-comp-len-0')).toHaveValue('200');
});

test('tubing sizing table matches the Production nodal engine', async ({ page }) => {
  const expected = tubingSizingTable({
    sizing: doc.params.sizing,
    stations,
    nodeMdM: res.packerMdM,
  });
  const row = expected.rows.find((r) => r.odIn === 2.875);

  await page.goto('/dev/completion-design');
  await expect(page.getByTestId('cd-string-bottom')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('cd-tab-sizing').click();
  await expect(page.getByTestId('cd-sizing-rows')).toBeVisible();
  await expect(page.getByTestId('cd-sizing-bhp-2.875')).toContainText(row.bhpPsi.toFixed(0), { timeout: 15000 });
  await expect(page.getByTestId('cd-sizing-rows')).toContainText('(in string)');
});
