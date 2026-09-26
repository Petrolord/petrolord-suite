// Electrofacies Studio senior test T1 on the /dev harness. Data: the
// engine's own seeded synthetic facies logs (syntheticFacies, 4 wells x 500
// rows, four facies with known GR/RHOB/NPHI/PEF means) uploaded as a table.
// The logs are proposed for clustering without re-ticking them; k-means
// recovers the facies (ARI > 0.95); in the depth tracks each cluster takes
// its matched facies' colour and says so in the legend.
import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { syntheticFacies } from '../packages/engines/tools/validation/dataai/synthetic_wells.js';

test('T1: upload, k-means against core, matched colours in the tracks', async ({ page }) => {
  test.setTimeout(240000);
  const { X, facies, groups } = syntheticFacies(2000, 4);
  let csv = 'well,depth,GR,RHOB,NPHI,PEF,facies\n';
  X.forEach((r, i) => { csv += `${groups[i]},${(1000 + (i % 500) * 0.5).toFixed(1)},${r.map((v) => v.toFixed(4)).join(',')},${facies[i]}\n`; });
  const file = path.join(os.tmpdir(), 'efacies-t1.csv');
  fs.writeFileSync(file, csv);

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/electrofacies-studio', { timeout: 120000 });
  await page.getByText('Upload', { exact: true }).first().click({ timeout: 60000 });
  await page.getByTestId('upload-input').setInputFiles(file);
  await page.getByTestId('group-col').selectOption({ label: 'well (text)' });
  await page.getByTestId('depth-col').selectOption({ label: 'depth' });
  await page.getByTestId('facies-col').selectOption({ label: 'facies (text)' });
  await page.getByTestId('use-upload').click();

  await page.getByRole('tab', { name: 'Clustering' }).click();
  await page.getByTestId('run-kmeans').click();          // enabled: the logs were proposed
  const ari = page.getByTestId('kmeans-core-ari');
  await expect(ari).toBeVisible({ timeout: 60000 });
  expect(Number(await ari.innerText())).toBeGreaterThan(0.95);

  await page.getByRole('tab', { name: 'Depth tracks' }).click();
  await expect(page.getByText(/cluster \d \(shaly_sand\)/)).toBeVisible();
  await expect(page.getByText(/cluster \d \(limestone\)/)).toBeVisible();
});
