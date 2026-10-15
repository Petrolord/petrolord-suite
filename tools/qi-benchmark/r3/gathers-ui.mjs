// Real-browser check of the Gathers tab on the QA account (QI round 3, after
// the link-signer fix #1172): sign in on the Suite's own login page, open QI
// Studio, choose the BENCH R3 store with its demultipled copy beside it,
// Show, and confirm the panel came back from storage (the caption and the
// drawn panel, no failed request). Run against an isolated dev server on
// 127.0.0.1:8330 (an origin the storage CORS allows).
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8330';
const out = { failedRequests: [], consoleErrors: [] };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('requestfailed', (r) => out.failedRequests.push(`${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
page.on('console', (m) => { if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 200)); });
await page.goto(`${BASE}/login`);
await page.fill('#email', process.env.QA_EMAIL);
await page.fill('#password', process.env.QA_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/dashboard/, { timeout: 60000 });
await page.goto(`${BASE}/dashboard/apps/geoscience/qi-studio`);
await page.getByTestId('qi-tab-gathers').click({ timeout: 120000 });
const store = page.getByTestId('qi-gathers-store');
await store.waitFor({ timeout: 60000 });
const opts = await store.locator('option').allTextContents();
out.stores = opts;
const target = opts.find((o) => o === 'BENCH R3 multiples gathers');
if (!target) throw new Error(`store not listed: ${opts.join(' | ')}`);
await store.selectOption({ label: target });
const cmp = page.getByTestId('qi-gathers-compare');
out.besideOptions = await cmp.locator('option').allTextContents();
await cmp.selectOption({ label: 'BENCH R3 demultipled' });
await page.getByTestId('qi-gathers-show').click();
const cap = page.getByTestId('qi-gathers-caption');
await cap.waitFor({ timeout: 300000 });
out.caption = (await cap.textContent()).slice(0, 300);
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/claude-0/r3/ui/gathers.png', fullPage: false });
out.panelRequests = out.failedRequests.filter((r) => r.includes('panels/'));
console.log(JSON.stringify(out, null, 1));
await browser.close();
