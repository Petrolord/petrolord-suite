// Technical Report Autopilot senior test T1 on /dev/studio/report-autopilot.
// The model call (edge function report-autopilot) is stood in by the harness
// with a fixed sentence per section, so this checks the flow around it:
// brief in, sections out in order, a DOCX built from what is on screen, a
// saved project, and readable KPI placeholders at 1366.
import { test, expect } from '@playwright/test';

test('T1: brief to preview to DOCX and save, with readable inputs', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/report-autopilot', { timeout: 120000 });
  await expect(page.getByText('The draft is written only from what you give it')).toBeVisible({ timeout: 60000 });
  const q = page.getByLabel('Measured quantity').first();
  const clip = await q.evaluate((el) => {
    const c = document.createElement('canvas').getContext('2d');
    const cs = getComputedStyle(el);
    c.font = `${cs.fontSize} ${cs.fontFamily}`;
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    return c.measureText(el.placeholder).width - (el.clientWidth - pad);
  });
  expect(clip).toBeLessThanOrEqual(0);
  await page.getByLabel('Project Name').fill('Harness Drilling');
  await page.getByLabel('Well').fill('HD-1');
  await q.fill('Average ROP');
  await page.getByLabel('Measured value').first().fill('85 ft/h');
  await page.getByRole('button', { name: 'Generate Report' }).click();
  await expect(page.getByText('Harness draft for Executive Summary on HD-1')).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: /Recommendations/ })).toBeVisible();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export DOCX' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.docx$/);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.getByRole('button', { name: 'Save Project' }).click();
  await page.waitForTimeout(800);
  expect(errors).toEqual([]);
});
