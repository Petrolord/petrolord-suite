// Capital Portfolio Studio senior test T1 on the /dev harness (in-memory
// Supabase, stand-in user). Four projects under a 500 $MM limit: EMVs A 120,
// B 80, C 0.6 x 150 - 0.4 x 40 = 74, D 30. The best set is A + B + D (capex
// 450, EMV 230); the frontier chart must show that optimum rather than clip
// it on the axis edge.
import { test, expect } from '@playwright/test';
const P=[['A',200,50,120,250,100,0],['B',150,20,80,160,100,0],['C',250,-20,150,400,60,40],['D',100,10,30,60,100,0]];
test('T1: optimum A+B+D and the frontier shows it', async ({ page }) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/capital-portfolio-studio', { timeout: 120000 });
  await page.waitForTimeout(4000);
  page.setDefaultTimeout(10000);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const d = page.getByRole('dialog');
  await d.locator('#name').fill('Budget 500'); await d.locator('#capex_limit').fill('500');
  await d.locator('button[type=submit]').click();
  await page.waitForTimeout(1200);
  await page.getByText('Budget 500').first().click();
  await page.waitForTimeout(800);
  for (const [n,c,p90,p50,p10,pos,fc] of P) {
    await page.getByRole('button', { name: /Add Project/ }).first().click();
    const f = page.getByRole('dialog');
    await f.locator('#name').fill(n); await f.locator('#capex').fill(String(c));
    await f.locator('#npv_p90').fill(String(p90)); await f.locator('#npv_p50').fill(String(p50)); await f.locator('#npv_p10').fill(String(p10));
    await f.locator('#pos').fill(String(pos)); await f.locator('#fail_cost').fill(String(fc));
    await f.getByRole('button', { name: 'Create Project' }).click();
    await page.waitForTimeout(800);
  }
  const boxes = page.getByRole('checkbox'); const n = await boxes.count(); 
  for (let i=0;i<n;i++){ const b=boxes.nth(i); if ((await b.getAttribute('data-state'))!=='checked') await b.click().catch(()=>{}); }
  await page.getByRole('button', { name: /Run Optimization/ }).click();
  await page.waitForTimeout(3000);
  await expect(page.getByText('$230 MM').first()).toBeVisible();
  await expect(page.getByText('$450 MM').first()).toBeVisible();
  // the optimum star sits inside the plot area, not on its edge
  // the shared ChartPanel card holds the title in its head and the chart in its body
  const frame = page.locator('[data-canvas="chart"]', { has: page.getByText('Efficient Frontier (risked EMV vs capital)') }).last();
  // the x axis runs past the 500 limit to a round 600; the chart draws after its
  // container is measured, so wait for the tick itself
  await expect(frame.locator('.recharts-cartesian-axis-tick-value', { hasText: /^600$/ })).toHaveCount(1);
  await expect(frame.locator('.recharts-scatter-symbol path[fill="#059669"], .recharts-scatter-symbol [fill="#059669"]').first()).toBeVisible();
});
