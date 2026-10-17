// Seismolord helpers for the Geoscience module showcase (copied from the QI
// showcase storyboards, qisc-common/qisc-steps, so the scenes stand alone).
import { openSeismolord, setVisible, showSlicePlanes, closeWindow, fullscreenBtn, explorerRow } from './seis-common.mjs';
import { t } from './geo-common.mjs';

export { openSeismolord, setVisible, showSlicePlanes, closeWindow, fullscreenBtn, explorerRow };
export const FULL = 'EKENE3D-v4-full.sgy';
export const combo = (d, name) => d.page.getByRole('combobox', { name });
export const ex = (d) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
export const mapSel = (d, i) => d.page.locator('[data-testid="window-map"] select').nth(i);
export const canvas3d = (d) => d.page.locator('[data-testid="window-3d"] canvas').first();

export async function activate(d, shared, name = FULL, { reopen = true } = {}) {
  if (reopen) await openSeismolord(d, shared);
  await d.page.getByText('Home', { exact: true }).first().click();
  await d.sleep(600);
  await combo(d, 'Active volume').selectOption({ label: name });
  await d.sleep(6000);
}

/** Off camera: only these explorer layers visible (slice planes untouched). */
export async function onlyVisible(d, names) {
  const all = await ex(d).locator('div[role=button] span.truncate').allInnerTexts();
  for (const n of all) if (!/^(Inline|Crossline|Time slice)/.test(n) && !names.includes(n)) await setVisible(d, n, false);
  for (const n of names) await setVisible(d, n, true);
}

export async function goTo(d, value, { quiet = false } = {}) {
  if (quiet) { await t(d, 'sl-goto').fill(String(value)); await t(d, 'sl-goto-btn').click(); await d.sleep(2500); return; }
  await d.type('sl-goto', String(value));
  await d.click('sl-goto-btn');
  await d.sleep(2200);
}

export async function windowsToggle(d, name, onCamera = true) {
  const w = d.page.getByRole('button', { name: /Windows/ });
  if (onCamera) await d.click(w); else await w.click();
  await d.sleep(600);
  const item = d.page.getByText(name, { exact: true }).last();
  if (onCamera) await d.click(item); else await item.click();
  await d.sleep(1000);
  await d.page.keyboard.press('Escape');
  await d.sleep(1500);
}

export async function showWindow(d, name, key, onCamera = true) {
  const win = d.page.locator(`[data-testid="window-${key}"]`);
  if (await win.isVisible().catch(() => false)) return;
  const tab = d.page.locator(`button[title="Show ${name}"]`);
  if (await tab.count()) { if (onCamera) await d.click(tab.first()); else await tab.first().click(); await d.sleep(1500); }
  if (await win.isVisible().catch(() => false)) return;
  await windowsToggle(d, name, onCamera);
}

/** A slow drag on the 3D canvas; the drawn cursor glides along with it. */
export async function drag3d(d, dx, dy, steps = 30) {
  const b = await canvas3d(d).boundingBox();
  const cx = b.x + b.width / 2; const cy = b.y + b.height / 2;
  await d.moveTo({ x: cx, y: cy });
  await d.page.mouse.move(cx, cy); await d.page.mouse.down();
  const glide = d.page.evaluate(([a, bb, ms]) => window.__demo.moveTo(a, bb, ms), [cx + dx, cy + dy, steps * 60]);
  for (let i = 1; i <= steps; i++) { await d.page.mouse.move(cx + (dx * i) / steps, cy + (dy * i) / steps); await d.sleep(40); }
  await glide;
  await d.page.mouse.up();
}

/** Off camera: the 3D window's layer toggles (they persist in this browser). */
export async function cubeLayers(d, want) {
  await d.page.locator('button[title="3D layers"]').click(); await d.sleep(800);
  for (const [label, on] of Object.entries(want)) {
    const item = d.page.getByRole('menuitemcheckbox', { name: label });
    if (!(await item.count())) continue;
    const checked = (await item.getAttribute('aria-checked')) === 'true';
    if (checked !== on) { await item.click(); await d.sleep(500); }
  }
  await d.page.keyboard.press('Escape'); await d.sleep(800);
}

/** Names of every explorer row (for dry runs). */
export const explorerNames = (d) => ex(d).locator('div[role=button] span.truncate').allInnerTexts();
