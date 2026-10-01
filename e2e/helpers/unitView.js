// Since the Suite unit profile (#830) every /dev harness opens on the
// profile's units (signed out: the built-in oilfield preset, so ft and degF).
// Specs anchored on an SI oracle start the tab on a metric view override
// instead: the same sessionStorage record the in-app unit toggle writes
// (useAppUnits, VIEW_PREFIX + app). It is seeded once per tab, so a test that
// picks another unit and reloads keeps its own choice.
//
//   test.beforeEach(async ({ page }) => { await seedUnitView(page, 'petrophysics'); });
//
// A test that asserts the profile default itself must NOT seed.

export const VIEW_PREFIX = 'petrolord.units.view.v1:';

export async function seedUnitView(page, app, units = { depth: 'm' }) {
  await page.addInitScript(({ key, value, flag }) => {
    try {
      if (!window.sessionStorage.getItem(flag)) {
        window.sessionStorage.setItem(flag, '1');
        window.sessionStorage.setItem(key, value);
      }
    } catch { /* storage blocked */ }
  }, { key: VIEW_PREFIX + app, value: JSON.stringify(units), flag: `e2e.unit-view.seeded:${app}` });
}
