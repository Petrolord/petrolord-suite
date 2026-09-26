// Value of Information Analyzer senior test T1 on the /dev harness. The
// default Phoenix study, by hand: EMV without information 0.3 x 300 + 0.7 x
// (-50) - 40 = 15; with the survey, drill on positive (0.6 x 300 + 0.4 x
// (-50) - 40 = 120) and walk away on negative, 0.4 x 120 = 48, less the 10
// survey = 38; net VOI 23; EVPI 0.3 x 260 - 15 = 63. Branch labels must not
// sit on the node EMV text.
import { test, expect } from '@playwright/test';

test('T1: VOI figures and a readable tree', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/voi-analyzer', { timeout: 120000 });
  await page.getByRole('button', { name: /Analyze & Simulate/ }).click({ timeout: 60000 });
  await expect(page.getByTestId('voi-kpi-emvWithoutInfo')).toHaveText('$15.00MM');
  await expect(page.getByTestId('voi-kpi-emvWithInfo')).toHaveText('$38.00MM');
  await expect(page.getByTestId('voi-kpi-netVoi')).toHaveText('$23.00MM');
  await expect(page.getByTestId('voi-kpi-evpi')).toHaveText('$63.00MM');

  // no branch label box intersects a node EMV label box
  const overlaps = await page.evaluate(() => {
    const svg = document.querySelector('svg[aria-label="Decision tree diagram"]');
    const texts = [...svg.querySelectorAll('text')].map((t) => ({ s: t.textContent, b: t.getBBox() }));
    const nodes = texts.filter((t) => /^EMV /.test(t.s));
    const edges = texts.filter((t) => /\(p=|cost /.test(t.s));
    const hit = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    return edges.flatMap((e) => nodes.filter((n) => hit(e.b, n.b)).map((n) => `${e.s} / ${n.s}`));
  });
  expect(overlaps).toEqual([]);
});
