// Earth Modeling helpers for the Geoscience module showcase, copied from the
// Earth Modeling storyboards (em-common.mjs, 3D grid upgrade 2026-10-17) so
// the module scenes stand alone. Nothing here writes registry data.
export const EM = '/dashboard/apps/geoscience/earth-modeling';
export const TOP = 'Ekene Sand top (6-well map)';
export const BASE = 'Ekene Sand base (6-well map)';
export const OWC_FT = '5036.1';
export const BO = '1.2';
export const t = (d, id) => d.page.getByTestId(id);

export async function openEm(d, shared) {
  await d.page.goto(`${shared.baseUrl}${EM}`, { waitUntil: 'domcontentloaded' });
  await t(d, 'em-explorer').waitFor({ timeout: 120000 });
  await t(d, `em-add-${TOP}`).waitFor({ timeout: 120000 });
  await d.sleep(2500);
}

const maybe = (d, onCamera) => ({
  click: (l) => (onCamera ? d.click(l) : l.click()),
  type: async (l, v) => { if (onCamera) await d.type(l, v); else { await l.click(); await l.fill(String(v)); } },
  select: async (l, v) => { if (onCamera) await d.select(l, v); else await l.selectOption(v); },
});

export async function stackEkene(d, { onCamera = false } = {}) {
  const m = maybe(d, onCamera);
  await m.click(t(d, `em-add-${TOP}`));
  await d.sleep(500);
  await m.click(t(d, `em-add-${BASE}`));
  await d.sleep(800);
}

export async function fluids(d, { owc = OWC_FT, bo = BO, onCamera = false } = {}) {
  const m = maybe(d, onCamera);
  await t(d, 'em-owc-0').scrollIntoViewIfNeeded();
  await m.type(t(d, 'em-owc-0'), owc);
  await m.type(t(d, 'em-bo-0'), bo);
}

export async function methods(d, { phi, sw, ntg }, { onCamera = false } = {}) {
  const m = maybe(d, onCamera);
  for (const [k, v] of Object.entries({ phi, sw, ntg })) {
    if (!v) continue;
    const sel = t(d, `em-method-${k}`);
    await sel.scrollIntoViewIfNeeded();
    if ((await sel.inputValue()) !== v) await m.select(sel, v);
  }
}

export async function build(d, { onCamera = false, timeout = 180000 } = {}) {
  if (onCamera) await d.click('em-build'); else await t(d, 'em-build').click();
  await d.page.waitForFunction(() => /^Built /.test(document.querySelector('[data-testid="em-status"]')?.textContent || ''), null, { timeout });
  await d.sleep(800);
}

export const CAP = 'Ogbia Shale cap';
export const SPLITS = ['Ekene Sand Middle', 'Ekene Sand Lower'];
export async function zonesAndCap(d, { onCamera = false, cap = true, split = true } = {}) {
  const m = maybe(d, onCamera);
  if (split) {
    for (const top of SPLITS) {
      const box = t(d, `em-split-0-${top}`);
      await box.scrollIntoViewIfNeeded();
      if (!(await box.isChecked())) await m.click(box);
    }
  }
  if (cap) {
    const on = t(d, 'em-cap-on');
    await on.scrollIntoViewIfNeeded();
    if (!(await on.isChecked())) await m.click(on);
    await m.type(t(d, 'em-cap-name'), CAP);
  }
}

export async function gridModel(d, { onCamera = false, phi = 'sgs', ntg = 'okrige', sw = 'idw', cap = true, split = true } = {}) {
  const m = maybe(d, onCamera);
  await stackEkene(d, { onCamera });
  await zonesAndCap(d, { onCamera, cap, split });
  await t(d, 'em-control').scrollIntoViewIfNeeded();
  if ((await t(d, 'em-control').inputValue()) !== 'logs') await m.select(t(d, 'em-control'), 'logs');
  await methods(d, { phi, ntg, sw }, { onCamera });
  if (sw === 'shm') {
    const sel = t(d, 'em-shm-project');
    await sel.scrollIntoViewIfNeeded();
    const v = await sel.locator('option', { hasText: 'Ekene Sand J-function' }).first().getAttribute('value');
    await m.select(sel, v);
  }
  await fluids(d, { onCamera });
}

export async function results(d, tab = 'charts', { onCamera = false } = {}) {
  if (onCamera) await d.click('em-view-qc'); else await t(d, 'em-view-qc').click();
  await d.sleep(800);
  const b = t(d, `em-results-${tab}`);
  if ((await b.getAttribute('aria-selected')) !== 'true') { if (onCamera) await d.click(b); else await b.click(); }
  await d.sleep(1200);
}

export async function grid3d(d, { prop = null, mode = null, density = null, ve = null, onCamera = true } = {}) {
  const m = maybe(d, onCamera);
  if ((await t(d, 'em-view-3d').getAttribute('class') || '').indexOf('border-pl-primary') < 0) await m.click(t(d, 'em-view-3d'));
  await d.sleep(1500);
  if (ve) await m.click(t(d, `em-3d-ve-${ve}`));
  if (mode) await m.select(t(d, 'em-3d-mode'), mode);
  if (prop) await m.select(t(d, 'em-3d-gridprop'), prop);
  if (density !== null) await m.select(t(d, 'em-3d-density'), String(density));
  await d.sleep(1500);
}

export async function setRange(locator, v) {
  await locator.evaluate((el, val) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, String(val));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, v);
}


/** Off camera: collapse the right dock (drag its resize handle to the edge) so the views get the room. */
export async function collapseDock(d) {
  const handles = d.page.locator('[data-panel-resize-handle-id]');
  const n = await handles.count();
  if (!n) return false;
  const h = handles.nth(n - 1);
  const b = await h.boundingBox();
  if (!b) return false;
  const vw = d.page.viewportSize()?.width || (await d.page.evaluate(() => window.innerWidth));
  await d.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await d.page.mouse.down();
  for (let i = 1; i <= 10; i++) { await d.page.mouse.move(b.x + ((vw + 40 - b.x) * i) / 10, b.y + b.height / 2); await d.sleep(30); }
  await d.page.mouse.up();
  await d.sleep(1200);
  return true;
}
