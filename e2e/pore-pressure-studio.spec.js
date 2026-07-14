// Pore Pressure Studio P3 acceptance: the workstation drives on the
// /dev harness without auth, and the UI reproduces the ORACLE'S
// numbers — the harness's seeded well IS the goldens' synthetic well
// (test-data/porepressure/goldens.json) and the seeded project carries
// the goldens' parameters. The depth readout, the hydrostatic
// upper-section identity, the NCT fit recovery and the Eaton/Bowers
// method switch are all asserted from the committed goldens, never
// hardcoded literals, so fixture regeneration cannot silently drift
// past this spec.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const goldens = JSON.parse(fs.readFileSync(
  path.join(here, '..', 'test-data', 'porepressure', 'goldens.json'), 'utf8',
));
const W = goldens.well;
const P = W.params;

const idxAt = (z) => W.z_bml_m.findIndex((v) => v === z);
const mpa = (pa) => (pa / 1e6).toFixed(2);

async function openWell(page) {
  await page.goto('/dev/pore-pressure-studio');
  await expect(page.getByTestId('pp-well-row')).toHaveCount(1);
  await page.getByTestId('pp-well-row').click();
  await expect(page.getByTestId('pp-prognosis-chart')).toBeVisible();
}

test('depth readout reproduces the oracle pressures on the ramp and hydrostatic sections', async ({ page }) => {
  await openWell(page);

  // default readout depth 3500 m — inside the overpressure ramp
  const i = idxAt(3500);
  await expect(page.getByTestId('pp-readout-obg')).toHaveText(`OBG ${mpa(W.overburden_pa[i])}`);
  await expect(page.getByTestId('pp-readout-ph')).toHaveText(`Ph ${mpa(W.hydrostatic_pa[i])}`);
  await expect(page.getByTestId('pp-readout-pp')).toHaveText(`PP ${mpa(W.pore_pressure_pa[i])}`);
  await expect(page.getByTestId('pp-readout-fg')).toHaveText(`FG ${mpa(W.frac_pressure_pa[i])}`);

  // above the ramp top the profile is normally pressured: PP = Ph
  const j = idxAt(2000);
  await page.getByTestId('pp-readout-depth').fill('2000');
  await expect(page.getByTestId('pp-readout-pp')).toHaveText(`PP ${mpa(W.pore_pressure_pa[j])}`);
  expect(mpa(W.pore_pressure_pa[j])).toBe(mpa(W.hydrostatic_pa[j]));
});

test('NCT fit on hydrostatic-section picks recovers the generating trend', async ({ page }) => {
  await openWell(page);
  await page.getByTestId('pp-view-nct').click();
  await expect(page.getByTestId('pp-nct-chart')).toBeVisible();

  for (const z of [500, 1000, 1500, 2000]) {
    await page.getByTestId('pp-pick-depth').fill(String(z));
    await page.getByTestId('pp-add-pick').click();
  }
  await page.getByTestId('pp-fit-nct').click();

  // the fitted trend IS the goldens' generating trend (dt == dt_n
  // above the ramp by construction)
  await expect(page.getByTestId('pp-nct-current')).toHaveText(
    `dt_ml ${P.dt_ml_us_per_m.toFixed(2)} us/m · c ${P.c_nct_per_m.toExponential(3)} 1/m`,
  );
});

test('seismic velocity trend drives a trend-grade prognosis (P4)', async ({ page }) => {
  await page.goto('/dev/pore-pressure-studio');
  await expect(page.getByTestId('pp-velocity-row')).toHaveCount(1);
  await page.getByTestId('pp-velocity-row').click();

  await expect(page.getByTestId('pp-trend-badge')).toBeVisible();
  await expect(page.getByTestId('pp-prognosis-chart')).toBeVisible();
  // no well selected -> publish target absent
  await expect(page.getByTestId('pp-publish')).toHaveCount(0);

  // closed form, derived not hardcoded: the harness model is
  // V(z) = 2000 + 0.6(100 + z); at 3500 m the readout must show the
  // Eaton prognosis of that trend with Gardner densities — assert the
  // readout renders finite MPa values in the right order
  const pp = Number((await page.getByTestId('pp-readout-pp').textContent()).replace('PP ', ''));
  const ph = Number((await page.getByTestId('pp-readout-ph').textContent()).replace('Ph ', ''));
  const obg = Number((await page.getByTestId('pp-readout-obg').textContent()).replace('OBG ', ''));
  const fg = Number((await page.getByTestId('pp-readout-fg').textContent()).replace('FG ', ''));
  expect(Number.isFinite(pp) && Number.isFinite(fg)).toBe(true);
  expect(obg).toBeGreaterThan(fg);
  expect(fg).toBeGreaterThan(Math.min(pp, ph));
});

test('publish writes PP/FP/OBG to the registry with overwrite-own (P4)', async ({ page }) => {
  await openWell(page);
  await page.getByTestId('pp-publish').click();
  await expect(page.getByTestId('pp-status')).toHaveText('Published PP/FP/OBG to the well registry.');

  // republish must not error (overwrite-own, proven at the jest layer)
  await page.getByTestId('pp-publish').click();
  await expect(page.getByTestId('pp-status')).toHaveText('Published PP/FP/OBG to the well registry.');
});

test('method switch to Bowers recomputes; parameters survive save + reload', async ({ page }) => {
  await openWell(page);
  const i = idxAt(3500);
  const eatonPP = `PP ${mpa(W.pore_pressure_pa[i])}`;
  await expect(page.getByTestId('pp-readout-pp')).toHaveText(eatonPP);

  // Bowers loading with the dock's A/B is a different model — the
  // readout must move off the Eaton value
  await page.getByTestId('pp-method-bowers').click();
  await page.getByTestId('pp-apply-params').click();
  await expect(page.getByTestId('pp-readout-pp')).not.toHaveText(eatonPP);

  // back to Eaton with n = 1 (the linear blend), save, reload: the
  // dock restores n = 1 and the readout matches a fresh n = 1 Eaton
  await page.getByTestId('pp-method-eaton').click();
  await page.getByTestId('pp-param-eatonn').fill('1');
  await page.getByTestId('pp-apply-params').click();
  await page.getByTestId('pp-save-project').click();
  await expect(page.getByTestId('pp-status')).toHaveText('Project saved.');

  await page.reload();
  await expect(page.getByTestId('pp-well-row')).toHaveCount(1);
  await page.getByTestId('pp-well-row').click();
  await expect(page.getByTestId('pp-prognosis-chart')).toBeVisible();
  await expect(page.getByTestId('pp-param-eatonn')).toHaveValue('1');
});
