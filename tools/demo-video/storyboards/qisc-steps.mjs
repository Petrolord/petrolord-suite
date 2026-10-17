// The QI showcase steps, shared by the main cut (qi-showcase) and the
// extended showcase (qi-showcase-x). A step lists the cuts it belongs to in
// `in` ('main', 'x'); `sayMain` and `subMain` replace the narration in the
// main cut where it is shorter. Every number spoken is asserted on screen
// (expectText) before the narration plays.
import {
  t, combo, ex, mapSel, pick, moreReady, readyCount, activate, onlyVisible, drag3d, goTo, openQiProject,
  setVisible, showSlicePlanes, closeWindow, fullscreenBtn, explorerRow, expectText, lineInputs,
  FULL, STACKS, IMPORT_NAME, IMPORT_FILE, STORE, DEMULT, DENOISED, MULT_MODEL, AREA, RMS_V4, RGB_FREQS,
} from './qisc-common.mjs';


const dialog = (d) => d.page.getByRole('dialog');
const SPEC = (f) => `${FULL} [Spectral decomposition ${f} Hz 120 ms]`;

/** Show a viewer window: leave it if it is already showing, bring its tab forward if it is open, else open it. */
async function showWindow(d, name, key, onCamera = true) {
  const win = d.page.locator(`[data-testid="window-${key}"]`);
  if (await win.isVisible().catch(() => false)) return;
  const tab = d.page.locator(`button[title="Show ${name}"]`);
  if (await tab.count()) { if (onCamera) await d.click(tab.first()); else await tab.first().click(); await d.sleep(1500); }
  if (await win.isVisible().catch(() => false)) return;
  await windowsToggle(d, name, onCamera);
}

async function windowsToggle(d, name, onCamera = true) {
  const w = d.page.getByRole('button', { name: /Windows/ });
  if (onCamera) await d.click(w); else await w.click();
  await d.sleep(600);
  const item = d.page.getByText(name, { exact: true }).last();
  if (onCamera) await d.click(item); else await item.click();
  await d.sleep(1000);
  await d.page.keyboard.press('Escape');
  await d.sleep(1500);
}

/**
 * Gathers tab: a store along inline 1027 across the Radon area, with another
 * beside it. `fetch: false` sets the form only (on camera); `fetchOnly` clicks
 * Show and waits for the worker's panel (a cut: the wait is dropped).
 */
async function showLine(d, store, beside, { onCamera = true, fetch = true, fetchOnly = false } = {}) {
  const setLine = async (cam) => {
    if (cam) await d.select('qi-gathers-mode', { label: 'along an inline' }); else await t(d, 'qi-gathers-mode').selectOption({ label: 'along an inline' });
    await d.sleep(500);
    const f = await lineInputs(d);
    await t(d, 'qi-gathers-line').fill('1027');
    await f.from.fill(String(AREA.xl0)); await f.to.fill(String(AREA.xl1)); await f.step.fill('1');
    await f.t0.fill('900'); await f.t1.fill('1700');
  };
  if (!fetchOnly) {
    const sel = async (id, name) => (onCamera ? pick(d, id, name, { exact: true }) : t(d, id).selectOption({ label: name }));
    await sel('qi-gathers-store', store);
    await sel('qi-gathers-compare', beside);
    if (await t(d, 'qi-gathers-result').count()) await setLine(onCamera);
    if (!fetch) return;
  }
  // the store's line numbers are known once one CDP has been shown (off the cut)
  if (!(await t(d, 'qi-gathers-result').count())) {
    await t(d, 'qi-gathers-mode').selectOption({ label: 'one CDP' });
    await t(d, 'qi-gathers-show').click();
    await t(d, 'qi-gathers-result').waitFor({ timeout: 900000 }); await d.sleep(3000);
    await setLine(false);
  }
  const before = await t(d, 'qi-gathers-caption').innerText().catch(() => '');
  if (onCamera && !fetchOnly) await d.click('qi-gathers-show'); else await t(d, 'qi-gathers-show').click();
  for (let i = 0; i < 600; i++) {
    const c = await t(d, 'qi-gathers-caption').innerText().catch(() => '');
    if (c !== before && /16 gathers/.test(c) && (beside === 'nothing' || c.includes(beside))) break;
    await d.sleep(1500);
  }
  await d.sleep(2500);
}

/** Properties: window, read the wells and start the calibration (the wait is a cut). */
async function calibrate(d, shared, done) {
  await d.page.getByLabel('Window start (ms)').fill('1200');
  await d.page.getByLabel('Window end (ms)').fill('1700');
  await d.click('qi-prop-read');
  await t(d, 'qi-prop-wells').waitFor({ timeout: 300000 });
  // a result stamped at or after the click (a repeat gives the same numbers)
  shared.values.calAt = new Date(Date.now() - 60000).toISOString().replace('T', ' ').slice(0, 16);
  await d.click('qi-prop-calibrate');
}
async function calibrated(d, shared, done) {
  for (let i = 0; i < 400; i++) {
    const x = await t(d, 'qi-prop-result').innerText().catch(() => '');
    const m = x.match(/Calibrated on [^\n]*?(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
    if (m && m[1] >= shared.values.calAt && done.test(x)) return;
    await d.sleep(1000);
  }
  throw new Error('the property calibration did not finish');
}

export function showcaseSteps(cut) {
  const steps = [
    // ---------------------------------------------------------------- import
    { id: 'intro', in: ['main', 'x'], chapter: 'QI Studio showcase', chapterSub: 'From a raw SEG-Y to a ranked prospect',
      say: 'From a raw SEG-Y file to a ranked prospect, on the Ekene field, in the Petrolord Suite. We start in Seismolord, with the full stack still on disk.',
      sayMain: 'From a raw SEG-Y file to a ranked prospect, on the Ekene field, in the Petrolord Suite.',
      do: async (d) => {
        await d.highlight('sl-start-step-import');
        await d.sleep(1800);
        await d.unhighlight();
        await d.click('sl-start-go-import');
        await dialog(d).waitFor();
      } },
    { id: 'scan', in: ['main', 'x'], chapter: 'Import', chapterSub: 'Header scan, crop, and where the seismic lives',
      say: 'The header scan measures the survey: twenty one thousand five hundred and four traces, inlines one thousand to eleven twenty seven, and eight hundred and seventy six samples at four milliseconds.',
      sub: 'The header scan measures the survey: 21,504 traces, inlines 1000 to 1127, and 876 samples at 4 ms.',
      sayMain: 'The header scan: twenty one thousand five hundred and four traces, eight hundred and seventy six samples at four milliseconds.',
      subMain: 'The header scan: 21,504 traces, 876 samples at 4 ms.',
      do: async (d) => {
        const chooser = d.page.waitForEvent('filechooser');
        await d.click(dialog(d).getByRole('button', { name: 'Choose SEG-Y file' }));
        await (await chooser).setFiles(IMPORT_FILE);
        await dialog(d).getByText('Vertical axis of this file').waitFor({ timeout: 120000 });
        await d.sleep(1200);
        const box = dialog(d).getByText(/^Format:/).locator('..');
        await expectText(d, box, /Traces: 21,504[\s\S]*Samples: 876 @ 4 ms[\s\S]*Inlines: 1000–1127[\s\S]*Crosslines: 1960–2127/, 'scan');
        await d.highlight(box);
      } },
    { id: 'crop', in: ['main', 'x'],
      say: 'We crop before importing: inlines ten ten to eleven ten, crosslines twenty ten to twenty one ten, eight hundred to twenty two hundred milliseconds. That keeps sixteen point eight of the eighty point five megabytes.',
      sub: 'We crop before importing: inlines 1010 to 1110, crosslines 2010 to 2110, 800 to 2200 ms. That keeps 16.8 of the 80.5 MB.',
      sayMain: 'We crop to the wells and the crest: sixteen point eight of the eighty point five megabytes.',
      subMain: 'We crop to the wells and the crest: 16.8 of the 80.5 MB.',
      do: async (d) => {
        await d.unhighlight();
        await t(d, 'sl-crop-on').scrollIntoViewIfNeeded();
        await d.click('sl-crop-on');
        await d.sleep(600);
        await t(d, 'sl-crop').scrollIntoViewIfNeeded();
        for (const [l, v] of [['First inline', '1010'], ['Last inline', '1110'], ['First crossline', '2010'], ['Last crossline', '2110'], ['Window start', '800'], ['Window end', '2200']]) {
          await d.type(dialog(d).getByLabel(l), v, { delay: 45 });
        }
        await d.sleep(800);
        await expectText(d, 'sl-crop-summary', /Keeps 10,201 of 21,504 traces[\s\S]*800 to 2200 ms[\s\S]*Size: 16\.8 MB of 80\.5 MB \(20\.8 percent\)/, 'crop summary');
        await d.highlight('sl-crop-summary');
      } },
    { id: 'upload-time', in: ['x'],
      say: 'At one megabyte a second the crop uploads in about seventeen seconds, against a minute for the whole file.',
      sub: 'At 1 MB a second the crop uploads in about 17 s, against a minute for the whole file.',
      do: async (d) => {
        await d.unhighlight();
        await t(d, 'sl-import-keep').scrollIntoViewIfNeeded();
        await d.click('sl-import-keep-cloud');
        await d.sleep(600);
        const server = dialog(d).getByText('On the Petrolord server');
        if (await server.count()) { await server.scrollIntoViewIfNeeded(); await d.click(server); }
        await d.sleep(800);
        const speed = dialog(d).getByLabel('Upload speed in MB per second');
        await speed.scrollIntoViewIfNeeded();
        await d.type(speed, '1', { delay: 60 });
        await d.sleep(800);
        await expectText(d, t(d, 'sl-crop-eta').locator('..'), /about\s*17 s\s*\(the whole file: 1 min\)/, 'upload estimate');
        await t(d, 'sl-crop-eta').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'sl-crop-eta').locator('..'));
      } },
    { id: 'keep-local', in: ['main', 'x'],
      say: 'Keep on this computer: nothing is uploaded, and every attribute and inversion of it runs here.',
      sayMain: 'Keep on this computer, and every attribute and inversion runs here.',
      do: async (d) => {
        await d.unhighlight();
        await t(d, 'sl-import-keep').scrollIntoViewIfNeeded();
        await d.click('sl-import-keep-local');
        await d.sleep(600);
        await expectText(d, 'sl-import-keep', /Nothing is uploaded\. It takes about a minute on a typical laptop drive and needs about 22 MB/, 'local estimate');
        await d.highlight('sl-import-keep');
      } },
    { id: 'import', in: ['main', 'x'],
      say: 'The import reads, checks and converts the file in this browser. The status bar follows it.',
      sayMain: 'The browser reads, checks and converts it.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: 'Start import' }));
        await d.sleep(1500);
        await d.highlight('import-jobs');
      },
      wait: async (d) => {
        for (let i = 0; i < 200; i++) {
          const s = await t(d, 'import-jobs').innerText().catch(() => '');
          if (/on this computer/.test(s) && !/converting|measuring|checking/.test(s)) return;
          await d.sleep(1500);
        }
        throw new Error('the local import did not finish');
      },
      waitLabel: 'Seconds later' },
    { id: 'badge', in: ['main', 'x'],
      say: 'Its badge says it lives on this computer. Not a byte of seismic went to the cloud.',
      sayMain: 'Its badge says it lives on this computer. Not a byte of seismic went to the cloud.',
      do: async (d) => {
        await d.unhighlight();
        const row = explorerRow(d, IMPORT_NAME);
        await row.scrollIntoViewIfNeeded();
        const badge = row.locator('[data-testid="volume-location"]');
        if ((await badge.getAttribute('data-location')) !== 'here') throw new Error('the location badge does not say here');
        await d.highlight(row);
      } },
    // ---------------------------------------------------------- seismic views
    { id: 'inline', in: ['main', 'x'], rampMax: 4, chapter: 'The seismic', chapterSub: 'Inline, crossline, time slice and 3D',
      say: 'The full survey is in the project. Inline ten twenty seven runs down dip through the discovery well, Ekene one: the listric growth fault, and the rollover against it.',
      sub: 'The full survey is in the project. Inline 1027 runs down dip through the discovery well, Ekene-1: the listric growth fault, and the rollover against it.',
      sayMain: 'The full survey: inline ten twenty seven through the discovery well, the growth fault and the rollover.',
      subMain: 'The full survey: inline 1027 through the discovery well, the growth fault and the rollover.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(combo(d, 'Active volume'));
        await combo(d, 'Active volume').selectOption({ label: FULL });
        await d.sleep(6000);
        await d.select(combo(d, 'Orientation'), { label: 'Inline' });
        await goTo(d, 1027);
        await d.click(fullscreenBtn(d, 'section'));
        await d.sleep(1500);
      } },
    { id: 'xline', in: ['x'], rampMax: 4,
      say: 'Crossline twenty fifty one runs along the fault through the same well, and the sand arches over the crest.',
      sub: 'Crossline 2051 runs along the fault through the same well, and the sand arches over the crest.',
      do: async (d) => {
        await d.click(fullscreenBtn(d, 'section'));
        await d.select(combo(d, 'Orientation'), { label: 'Crossline' });
        await goTo(d, 2051);
        await d.click(fullscreenBtn(d, 'section'));
        await d.sleep(1200);
      } },
    { id: 'tslice', in: ['main', 'x'], rampMax: 4,
      say: 'At twelve ninety two milliseconds the time slice cuts the top of the sand in rings round the crest, cut off by the growth fault.',
      sub: 'At 1292 ms the time slice cuts the top of the sand in rings round the crest, cut off by the growth fault.',
      sayMain: 'At twelve ninety two milliseconds the rings close round the crest.',
      subMain: 'At 1292 ms the rings close round the crest.',
      do: async (d) => {
        await d.click(fullscreenBtn(d, 'section'));
        await d.select(combo(d, 'Orientation'), { label: 'Time slice' });
        await goTo(d, 1292);
        await d.click(fullscreenBtn(d, 'section'));
        await d.sleep(1200);
      } },
    { id: 'cube', in: ['main', 'x'], rampMax: 4,
      say: 'The three D window: a chair display through the discovery well, with the rings on the slice.',
      sub: 'The 3D window: a chair display through the discovery well, with the rings on the slice.',
      sayMain: 'In three D, a chair display through the discovery.',
      subMain: 'In 3D, a chair display through the discovery.',
      do: async (d) => {
        await d.click(fullscreenBtn(d, 'section'));
        await showWindow(d, '3D', '3d');
        await d.page.locator('[data-testid="window-3d"] canvas').first().waitFor();
        await d.sleep(4000);
        await d.click(fullscreenBtn(d, '3d'));
        await d.sleep(2500);
      } },
    { id: 'orbit', in: ['main', 'x'], rampMax: 6,
      say: 'We swing round the crest. On the slice the rings close against the fault, and the sections show the rollover in both directions.',
      sayMain: 'We swing round the crest.',
      do: async (d) => {
        const c = d.page.locator('[data-testid="window-3d"] canvas').first();
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
        for (let i = 0; i < 2; i++) { await d.page.mouse.wheel(0, -200); await d.sleep(300); }
        if (cut === 'main') {
          await drag3d(d, -240, 0, 40);
        } else {
          await drag3d(d, -180, 0, 45);
          await d.sleep(500);
          await drag3d(d, 0, 18, 15);
          await d.sleep(500);
          await drag3d(d, -150, 0, 40);
        }
      } },

    // ------------------------------------------------------------ conditioning
    { id: 'gathers-open', in: ['main', 'x'], chapter: 'Prestack conditioning', chapterSub: 'QI Studio · Prestack and Gathers',
      say: 'In QI Studio the gathers come first, along inline ten twenty seven through Ekene one.',
      sub: 'In QI Studio the gathers come first, along inline 1027 through Ekene-1.',
      sayMain: 'In QI Studio, the gathers come first.',
      do: async (d, shared) => {
        await d.click(fullscreenBtn(d, '3d'));
        await openQiProject(d, shared);
        await d.click('qi-tab-gathers');
        await d.sleep(2500);
        await showLine(d, STORE, 'nothing', { fetch: false });
      },
      wait: async (d) => { await showLine(d, STORE, 'nothing', { fetchOnly: true }); },
      waitLabel: 'Seconds later' },
    { id: 'gathers', in: ['main', 'x'],
      say: 'These NMO corrected gathers carry multiples, the energy that curves down below the top of the Ekene Sand, and random noise.',
      sub: 'These NMO-corrected gathers carry multiples, the energy that curves down below the top of the Ekene Sand, and random noise.',
      sayMain: 'They carry multiples, curving down below the top of the sand, and random noise.',
      do: async (d) => {
        await t(d, 'qi-gathers-line-0').scrollIntoViewIfNeeded();
        await expectText(d, 'qi-gathers-line-0', new RegExp(`${STORE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: inline 1027, crosslines 2044 to 2059`), 'input gathers');
        const c = d.page.locator('[data-testid="qi-gathers-canvas-0-line"]');
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.3, y: b.y + b.height * 0.62 }, { ms: 1400 });
        await d.sleep(800);
        await d.moveTo({ x: b.x + b.width * 0.7, y: b.y + b.height * 0.66 }, { ms: 1800 });
      } },
    { id: 'radon', in: ['x'],
      say: 'Parabolic Radon separates events by moveout: the primaries are flat after NMO, the multiples curve. At about a second a gather, we run the area round Ekene one, two hundred and fifty six gathers, and keep what it removes.',
      sub: 'Parabolic Radon separates events by moveout: the primaries are flat after NMO, the multiples curve. At about a second a gather, we run the area round Ekene-1, 256 gathers, and keep what it removes.',
      do: async (d) => {
        await d.click('qi-tab-prestack');
        await d.sleep(3000);
        await t(d, 'qi-pre-cond').scrollIntoViewIfNeeded();
        await pick(d, 'qi-pre-cond-store', STORE, { exact: true });
        await d.click('qi-pre-cond-radon');
        if (!(await t(d, 'qi-pre-cond-area').isChecked())) await d.click('qi-pre-cond-area');
        for (const [l, v] of [['Area inline from', AREA.il0], ['Area inline to', AREA.il1], ['Area crossline from', AREA.xl0], ['Area crossline to', AREA.xl1]]) {
          await d.type(d.page.getByLabel(l), String(v), { delay: 45 });
        }
        if (!(await t(d, 'qi-pre-cond-keep').isChecked())) await d.click('qi-pre-cond-keep');
        await d.click('qi-pre-cond-run');
      },
      wait: async (d) => {
        await d.page.locator('[data-testid^="qi-pre-cond-run-"]').filter({ hasText: /Radon demultiple of[\s\S]*percent of the energy removed/ }).first().waitFor({ timeout: 1800000 });
        for (let i = 0; i < 40; i++) {
          if ((await t(d, 'qi-pre-cond-store').locator('option').allInnerTexts()).includes(DEMULT)) break;
          if (i % 5 === 4) { await t(d, 'qi-tab-setup').click(); await d.sleep(800); await t(d, 'qi-tab-prestack').click(); await d.sleep(2500); }
          await d.sleep(1500);
        }
      } },
    { id: 'radon-result', in: ['main', 'x'],
      say: 'Thirteen percent of the energy came out, most of it between four hundred and seventy six and fourteen twenty eight milliseconds.',
      sub: '13 percent of the energy came out, most of it between 476 and 1428 ms.',
      sayMain: 'Radon took out thirteen percent of the energy, most of it where the multiples are.',
      subMain: 'Radon took out 13 percent of the energy, most of it where the multiples are.',
      do: async (d, shared) => {
        if (cut === 'main') {
          await d.click('qi-tab-prestack');
          await d.sleep(3000);
        }
        const res = d.page.locator('[data-testid^="qi-pre-cond-run-"]').filter({ hasText: /Radon demultiple of/ }).first();
        await res.scrollIntoViewIfNeeded();
        await expectText(d, res, /256 CDPs in inlines 1020 to 1035, crosslines 2044 to 2059, 13 percent of the energy removed, 0\.51 s per gather[\s\S]*476 to 952\s*22\s*1\.1[\s\S]*952 to 1428\s*14\s*0\.7/, 'radon result');
        await d.highlight(res);
      } },
    { id: 'fx', in: ['x'],
      say: 'Then f x deconvolution on the demultipled gathers, to drop the random noise.',
      sub: 'Then f-x deconvolution on the demultipled gathers, to drop the random noise.',
      do: async (d) => {
        await d.unhighlight();
        // the store list follows the worker's datasets: wait for the new store
        for (let i = 0; i < 40; i++) {
          const o = await t(d, 'qi-pre-cond-store').locator('option').allInnerTexts();
          if (o.includes(DEMULT)) break;
          if (i % 5 === 4) { await t(d, 'qi-tab-setup').click(); await d.sleep(800); await t(d, 'qi-tab-prestack').click(); await d.sleep(2500); }
          await d.sleep(1500);
        }
        await t(d, 'qi-pre-cond').scrollIntoViewIfNeeded();
        await pick(d, 'qi-pre-cond-store', DEMULT, { exact: true });
        await d.click('qi-pre-cond-fx');
        if (!(await t(d, 'qi-pre-cond-area').isChecked())) await d.click('qi-pre-cond-area');
        for (const [l, v] of [['Area inline from', AREA.il0], ['Area inline to', AREA.il1], ['Area crossline from', AREA.xl0], ['Area crossline to', AREA.xl1]]) {
          await d.page.getByLabel(l).fill(String(v));
        }
        await d.click('qi-pre-cond-run');
      },
      wait: async (d) => {
        await d.page.locator('[data-testid^="qi-pre-cond-run-"]').filter({ hasText: /f-x noise attenuation of[\s\S]*percent of the energy removed/ }).first().waitFor({ timeout: 900000 });
      },
      waitLabel: 'Seconds later' },
    { id: 'fx-result', in: ['x'],
      say: 'Another six percent of the energy, the noise, came out.',
      sub: 'Another 6 percent of the energy, the noise, came out.',
      do: async (d) => {
        const res = d.page.locator('[data-testid^="qi-pre-cond-run-"]').filter({ hasText: /f-x noise attenuation of/ }).first();
        await res.scrollIntoViewIfNeeded();
        await expectText(d, res, /6 percent of the energy removed/, 'f-x result');
        await d.highlight(res);
      } },
    { id: 'removed-open', in: ['main', 'x'],
      say: 'Here is the result, beside what was removed.',
      sayMain: 'The result, beside what was removed.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('qi-tab-gathers');
        await d.sleep(2500);
        await showLine(d, DEMULT, MULT_MODEL, { fetch: false });
      },
      wait: async (d) => { await showLine(d, DEMULT, MULT_MODEL, { fetchOnly: true }); },
      waitLabel: 'Seconds later' },
    { id: 'removed', in: ['main', 'x'],
      say: 'The multiple model holds only curved energy, and is empty at the top of the sand, so the primaries and their AVO are untouched.',
      sayMain: 'The multiple model is empty at the top of the sand, so the primaries and their AVO are untouched.',
      do: async (d) => {
        await t(d, 'qi-gathers-line-0').scrollIntoViewIfNeeded();
        await d.sleep(1500);
        await d.scroll(t(d, 'qi-gathers-line-1'), 420, { ms: 1800 });
        await expectText(d, 'qi-gathers-line-1', /multiple model: inline 1027, crosslines 2044 to 2059/, 'removed part');
      } },
    { id: 'clean-open', in: ['x'],
      say: 'And the demultipled gathers beside the result of f x.',
      sub: 'And the demultipled gathers beside the result of f-x.',
      do: async (d) => {
        await d.scroll(t(d, 'qi-gathers-result'), -600, { ms: 900 });
        for (let i = 0; i < 40; i++) {
          if ((await t(d, 'qi-gathers-compare').locator('option').allInnerTexts()).includes(DENOISED) || (await t(d, 'qi-gathers-store').locator('option').allInnerTexts()).includes(DENOISED)) break;
          await t(d, 'qi-tab-prestack').click(); await d.sleep(1500); await t(d, 'qi-tab-gathers').click(); await d.sleep(2500);
        }
        await showLine(d, DEMULT, DENOISED, { fetch: false });
      },
      wait: async (d) => { await showLine(d, DEMULT, DENOISED, { fetchOnly: true }); },
      waitLabel: 'Seconds later' },
    { id: 'clean', in: ['x'],
      say: 'The random noise is gone, and the events read flat and clean across the offsets.',
      do: async (d) => {
        await t(d, 'qi-gathers-line-0').scrollIntoViewIfNeeded();
        await d.sleep(1500);
        await d.scroll(t(d, 'qi-gathers-line-1'), 420, { ms: 1800 });
      } },
    { id: 'balance', in: ['x'], chapter: 'Angle stacks', chapterSub: 'Balanced and matched for AVO',
      say: 'The full survey stacks are balanced to one bandwidth before AVO: the far stack\'s centroid moves from thirty one point one to thirty point three hertz, onto the near stack\'s.',
      sub: 'The full-survey stacks are balanced to one bandwidth before AVO: the far stack\'s centroid moves from 31.1 to 30.3 Hz, onto the near stack\'s.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('qi-tab-avo');
        await d.sleep(3000);
        const res = t(d, 'qi-avo-balance-result');
        await res.scrollIntoViewIfNeeded();
        await expectText(d, res, /EKENE3D-v4-far\.sgy\s*31\.1 to 30\.3\s*30\.3\s*14 to 43; 16 to 39/, 'balance');
        await d.highlight(res);
      } },
    // -------------------------------------------------- spectral decomposition
    { id: 'spec-dialog', in: ['x'], chapter: 'Spectral decomposition', chapterSub: 'Seismolord · three frequencies as RGB',
      say: 'Spectral decomposition, in Seismolord: one run makes twelve, twenty five and forty hertz volumes on the Petrolord server.',
      sub: 'Spectral decomposition, in Seismolord: one run makes 12, 25 and 40 Hz volumes on the Petrolord server.',
      do: async (d, shared) => {
        await d.unhighlight();
        await activate(d, shared, FULL);
        await d.click('sl-ribbon-tab-interpretation');
        await d.click(d.page.getByRole('button', { name: /Attribute volume/ }));
        await dialog(d).waitFor();
        await d.select(dialog(d).locator('select').first(), 'spectral');
        await d.click('sl-attr-rgb-set');
        if ((await t(d, 'sl-attr-rgb-freqs').inputValue()) !== '12, 25, 40') throw new Error('the RGB set is not 12, 25, 40 Hz');
        await d.click(dialog(d).getByText('On the Petrolord server'));
        await d.highlight('sl-attr-rgb');
        await d.sleep(1500);
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: /^Compute/ }));
      },
      wait: async (d) => {
        for (let i = 0; i < 400; i++) {
          await d.sleep(3000);
          const opts = await combo(d, 'Active volume').locator('option').allInnerTexts().catch(() => []);
          if (RGB_FREQS.every((f) => opts.includes(SPEC(f)))) break;
          if (i % 10 === 9) { await d.page.getByText('Home', { exact: true }).first().click().catch(() => {}); await d.page.locator('button[title="Refresh"]').first().click().catch(() => {}); }
        }
        await d.page.getByText('Home', { exact: true }).first().click();
      } },
    { id: 'rgb-pick', in: ['main', 'x'],
      say: 'Spectral R G B shows them at once: red twelve, green twenty five, blue forty hertz.',
      sub: 'Spectral RGB shows them at once: red 12, green 25, blue 40 Hz.',
      sayMain: 'Spectral decomposition: twelve, twenty five and forty hertz, as red, green and blue.',
      subMain: 'Spectral decomposition: 12, 25 and 40 Hz, as red, green and blue.',
      do: async (d, shared) => {
        if (cut === 'main') { await activate(d, shared, FULL); }
        await d.page.getByText('Home', { exact: true }).first().click();
        await d.sleep(800);
        const auto = t(d, 'sl-rgb-auto');
        await auto.scrollIntoViewIfNeeded();
        await d.click(auto);
        await d.sleep(2500);
        for (const [c, f] of [['red', 12], ['green', 25], ['blue', 40]]) await expectText(d, t(d, `sl-rgb-${c}`).locator('option:checked'), new RegExp(`Spectral decomposition ${f} Hz`), `${c} channel`);
        await d.highlight(d.page.locator('[data-ribbon-group="Spectral RGB"]'));
      } },
    { id: 'rgb-slice', in: ['main', 'x'], rampMax: 4,
      say: 'Thin beds tune at a frequency set by their thickness, so on the time slice the colour maps the sand across the closure.',
      sayMain: 'Thin beds tune at a frequency set by their thickness, so the colour maps the sand across the closure.',
      do: async (d) => {
        await d.unhighlight();
        await setVisible(d, 'Top Ekene Sand', true);
        await showWindow(d, 'Map', 'map');
        await d.sleep(3000);
        await d.click(d.page.locator('[data-testid="window-map"] button[title="Fullscreen"]'));
        await d.sleep(3500);
      } },
    { id: 'rgb-horizon', in: ['main', 'x'], rampMax: 3,
      say: 'Along the top of the sand, under the structure contours, the readout names the strongest frequency.',
      sayMain: 'Along the top of the sand, the readout names the strongest frequency.',
      do: async (d) => {
        await mapSel(d, 0).selectOption({ label: 'Top Ekene Sand' });
        await d.sleep(1500);
        await d.select(mapSel(d, 2), 'rgb');
        await d.sleep(7000);
        const c = d.page.locator('[data-testid="window-map"] canvas').first();
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.62, y: b.y + b.height * 0.55 }, { ms: 1400 });
        await d.page.mouse.move(b.x + b.width * 0.62, b.y + b.height * 0.55);
        await d.sleep(1500);
        await d.moveTo({ x: b.x + b.width * 0.75, y: b.y + b.height * 0.4 }, { ms: 1600 });
        await d.page.mouse.move(b.x + b.width * 0.75, b.y + b.height * 0.4);
      } },
    // --------------------------------------------------------- ties and wavelets
    { id: 'synth', in: ['main', 'x'], chapter: 'Well ties and wavelets', chapterSub: 'Seismolord · Synthetics',
      say: 'Every QI number rests on the well ties. At Ekene one we extract the wavelet from the seismic and build the synthetic.',
      sub: 'Every QI number rests on the well ties. At Ekene-1 we extract the wavelet from the seismic and build the synthetic.',
      sayMain: 'The ties come first. At Ekene one, the wavelet and the synthetic.',
      subMain: 'The ties come first. At Ekene-1, the wavelet and the synthetic.',
      do: async (d) => {
        await d.click(d.page.locator('[data-testid="window-map"] button[title="Fullscreen"]'));
        await d.sleep(800);
        await showWindow(d, 'Synthetics', 'synthetic');
        await t(d, 'synth').waitFor({ timeout: 30000 });
        const wells = await t(d, 'synth-well').locator('option').allInnerTexts();
        await d.select('synth-well', { label: wells.find((x) => /^Ekene-1(?!\d)/.test(x)) });
        await d.sleep(1500);
        await d.click('synth-extract');
      },
      wait: async (d) => {
        await expectText(d, 'synth-wavelet-info', /peak 26\.3 Hz, phase 0 deg/, 'wavelet');
        await t(d, 'synth-run').click();
        await d.sleep(5000);
        await t(d, 'synth-suggest').click();
        await expectText(d, 'synth-suggest-result', /best 0 ms \(r = 0\.73\)/, 'bulk shift');
      },
      waitLabel: 'Seconds later' },
    { id: 'synth-result', in: ['main', 'x'],
      say: 'The statistical wavelet peaks at twenty six point three hertz, zero phase, and the synthetic ties best at zero milliseconds, a correlation of zero point seven three.',
      sub: 'The statistical wavelet peaks at 26.3 Hz, zero phase, and the synthetic ties best at 0 ms, a correlation of 0.73.',
      sayMain: 'It ties best at zero milliseconds, a correlation of zero point seven three.',
      subMain: 'It ties best at 0 ms, a correlation of 0.73.',
      do: async (d) => {
        await d.highlight('synth-wavelet-info');
        await d.sleep(1800);
        await d.highlight('synth-suggest-result');
      } },
    { id: 'anchors', in: ['main', 'x'],
      say: 'Suggest anchors finds forty five matching events and lifts the correlation to zero point seven nine. The study keeps its committed tie.',
      sub: 'Suggest anchors finds 45 matching events and lifts the correlation to 0.79. The study keeps its committed tie.',
      sayMain: 'Suggest anchors lifts it to zero point seven nine.',
      subMain: 'Suggest anchors lifts it to 0.79.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('synth-anchors-suggest');
        await expectText(d, 'synth-anchors-suggest-result', /45 anchors suggested with a 0 degree phase: correlation 0\.73 before, 0\.79 after/, 'anchors');
        await d.highlight('synth-anchors-suggest-result');
      } },
    { id: 'phase', in: ['x'],
      say: 'Phase along the tie: one constant phase fits the whole well.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('synth-phase-profile');
        const r = d.page.getByText(/^Phase along the tie: /);
        await expectText(d, r, /One phase gives r 0\.79; a phase varying with time gives r 0\.80\. A constant phase fits this tie\./, 'phase');
        await d.highlight(r);
      } },
    // ------------------------------------------------------------- inversion
    { id: 'blind', in: ['main', 'x'], chapter: 'Inversion', chapterSub: 'QI Studio · post-stack and simultaneous',
      say: 'Post stack inversion, with a low frequency model from the wells guided by the framework horizons, each well left out in turn.',
      sub: 'Post-stack inversion, with a low-frequency model from the wells guided by the framework horizons, each well left out in turn.',
      sayMain: 'Post stack inversion, guided by the framework horizons, with each well left out in turn.',
      subMain: 'Post-stack inversion, guided by the framework horizons, with each well left out in turn.',
      do: async (d, shared) => {
        await d.unhighlight();
        await openQiProject(d, shared);
        await d.click('qi-tab-inversion');
        await d.sleep(3000);
        await pick(d, 'qi-inv-volume', FULL, { exact: true });
        await d.sleep(1500);
        for (const h of ['Top Ekene Sand', 'Ekene Sand Base', 'Oboro Unconformity']) {
          const box = t(d, 'qi-inv-horizons').locator(`label:has-text("${h}") input`).first();
          if (!(await box.isChecked())) await d.click(box);
        }
        await d.click('qi-inv-read-wells');
        await t(d, 'qi-inv-wells').waitFor({ timeout: 600000 });
        // a result stamped at or after the click (an earlier check stays on screen until then)
        shared.values.blindAt = new Date(Date.now() - 60000).toISOString().replace('T', ' ').slice(0, 16);
        await d.click('qi-inv-blind');
      },
      wait: async (d, shared) => {
        for (let i = 0; i < 600; i++) {
          const x = await t(d, 'qi-inv-blind-result').innerText().catch(() => '');
          const m = x.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}):/);
          if (m && m[1] >= shared.values.blindAt) return;
          await d.sleep(1500);
        }
        throw new Error('the blind check did not finish');
      },
      waitLabel: 'Seconds later' },
    { id: 'blind-result', in: ['main', 'x'],
      say: 'Blind errors of six point five to seven point three percent, correlations up to zero point eight two, and three percent of the seismic left unexplained.',
      sub: 'Blind errors of 6.5 to 7.3 percent, correlations up to 0.82, and 3 percent of the seismic left unexplained.',
      sayMain: 'Blind errors of six point five to seven point three percent.',
      subMain: 'Blind errors of 6.5 to 7.3 percent.',
      do: async (d) => {
        await t(d, 'qi-inv-blind-result').scrollIntoViewIfNeeded();
        await expectText(d, 'qi-inv-blind-result', /Ekene-1\s*0\.77\s*6\.6[\s\S]*Ekene-2\s*0\.81\s*7\.2[\s\S]*Ekene-3\s*0\.82\s*6\.5[\s\S]*Ekene-4\s*0\.81\s*7\.3[\s\S]*Ekene-1 3, Ekene-2 3, Ekene-3 3, Ekene-4 3/, 'blind wells');
        await d.highlight('qi-inv-blind-result');
      } },
    { id: 'inv-run', in: ['x'],
      say: 'We invert the survey, and write the residual volume too.',
      do: async (d, shared) => {
        await d.unhighlight();
        if (!(await t(d, 'qi-inv-residual').isChecked())) await d.click('qi-inv-residual');
        shared.values.invReady = await readyCount(d, 'qi-inv-runs');
        await d.click('qi-inv-run');
      },
      wait: async (d, shared) => { await moreReady(d, 'qi-inv-runs', shared.values.invReady); } },
    { id: 'sim', in: ['main', 'x'],
      say: 'Simultaneous inversion of the near, mid and far stacks at ten, twenty and thirty degrees, guided by the same horizons.',
      sub: 'Simultaneous inversion of the near, mid and far stacks at 10, 20 and 30 degrees, guided by the same horizons.',
      sayMain: 'Simultaneous inversion of the near, mid and far stacks, guided by the same horizons.',
      do: async (d, shared) => {
        await d.unhighlight();
        await d.click('qi-tab-simultaneous');
        await d.sleep(3000);
        for (const [k, s, a] of [[0, STACKS[0], 10], [1, STACKS[1], 20], [2, STACKS[2], 30]]) {
          await pick(d, `qi-sim-stack-${k}`, s, { exact: true });
          await d.type(`qi-sim-angle-${k}`, String(a), { delay: 50 });
        }
        await d.sleep(1500);
        for (const h of ['Top Ekene Sand', 'Ekene Sand Base', 'Oboro Unconformity']) {
          const box = d.page.locator(`label:has-text("${h} (on ${FULL})") input[type=checkbox]`).first();
          if (!(await box.isChecked())) await d.click(box);
        }
        await d.click('qi-sim-read');
        await t(d, 'qi-sim-wells').waitFor({ timeout: 600000 });
        await d.click('qi-sim-blind');
      },
      wait: async (d) => {
        // the button is disabled while the check runs (a repeat gives the same table, so the text cannot tell)
        await d.sleep(3000);
        for (let i = 0; i < 1200; i++) {
          if (await t(d, 'qi-sim-blind').isEnabled() && await t(d, 'qi-sim-blind-table').count()) { await d.sleep(1500); return; }
          await d.sleep(1500);
        }
        throw new Error('the simultaneous blind check did not finish');
      },
      waitLabel: 'Seconds later' },
    { id: 'sim-result', in: ['main', 'x'],
      say: 'Blind, the impedance error is five point eight to six point five percent at the four wells.',
      sayMain: 'Blind, the impedance error is five point eight to six point five percent.',
      subMain: 'Blind, the impedance error is 5.8 to 6.5 percent.',
      do: async (d) => {
        await t(d, 'qi-sim-blind-table').scrollIntoViewIfNeeded();
        await expectText(d, 'qi-sim-blind-table', /Ekene-1\s*5\.9[\s\S]*Ekene-2\s*6\.5[\s\S]*Ekene-3\s*5\.8[\s\S]*Ekene-4\s*6\.2/, 'simultaneous blind');
        await d.highlight('qi-sim-blind-table');
      } },
    { id: 'sim-run', in: ['x'],
      say: 'The survey runs on the worker.',
      do: async (d, shared) => {
        await d.unhighlight();
        shared.values.simReady = await readyCount(d, 'qi-sim-runs');
        await d.click('qi-sim-run');
      },
      wait: async (d, shared) => { await moreReady(d, 'qi-sim-runs', shared.values.simReady); } },
    // ------------------------------------------------------------ properties
    { id: 'facies', in: ['main', 'x'], chapter: 'Properties', chapterSub: 'QI Studio · facies, porosity, net-to-gross',
      say: 'Bayesian facies from the simultaneous impedance, using the facies drawn on the wells\' crossplot in Rock Physics Studio.',
      sayMain: 'Bayesian facies from the impedance: hydrocarbon sand, brine sand and shale.',
      do: async (d, shared) => {
        await d.unhighlight();
        await d.click('qi-tab-properties');
        await d.sleep(2500);
        await pick(d, 'qi-prop-ai', 'EKENE3D-v4-near.sgy: AI, SI, density, Vp/Vs', { last: true });
        await d.select('qi-prop-kind', { label: 'Facies probability (Bayesian)' });
        await d.sleep(800);
        if (await t(d, 'qi-prop-attrs').count()) await d.select('qi-prop-attrs', 'ai');
        await calibrate(d, shared, /Facies right/);
      },
      wait: async (d, shared) => { await calibrated(d, shared, /Facies right/); },
      waitLabel: 'Seconds later' },
    { id: 'facies-result', in: ['main', 'x'],
      say: 'Left out in turn, each well\'s facies are predicted right forty nine to ninety percent of the time.',
      sayMain: 'Left out, each well is predicted right forty nine to ninety percent of the time.',
      subMain: 'Left out, each well is predicted right 49 to 90 percent of the time.',
      do: async (d) => {
        await t(d, 'qi-prop-result').scrollIntoViewIfNeeded();
        await expectText(d, 'qi-prop-result', /Ekene-1\s*55\s*49[\s\S]*Ekene-2\s*22\s*73[\s\S]*Ekene-3\s*21\s*57[\s\S]*Ekene-4\s*21\s*90/, 'facies check');
        await d.highlight('qi-prop-result');
      } },
    { id: 'facies-run', in: ['x'],
      say: 'Its volume gives the probability of each facies at every sample.',
      do: async (d, shared) => {
        await d.unhighlight();
        shared.values.propReady = await readyCount(d, 'qi-prop-runs');
        await d.click('qi-prop-run');
      },
      wait: async (d, shared) => { await moreReady(d, 'qi-prop-runs', shared.values.propReady); } },
    { id: 'porosity', in: ['main', 'x'],
      say: 'Porosity comes from the post stack impedance, over the reservoir window.',
      sub: 'Porosity comes from the post-stack impedance, over the reservoir window.',
      sayMain: 'Porosity, with Q10, Q50 and Q90.',
      do: async (d, shared) => {
        await d.unhighlight();
        if (!(await t(d, 'qi-prop-ai').isVisible().catch(() => false))) { await d.click('qi-tab-properties'); await d.sleep(2500); }
        await pick(d, 'qi-prop-ai', `${FULL} AI, Model-based`, { exact: true, last: true });
        await d.select('qi-prop-kind', { label: 'Porosity from impedance' });
        await d.sleep(800);
        await calibrate(d, shared, /porosity =/);
      },
      wait: async (d, shared) => { await calibrated(d, shared, /porosity =/); },
      waitLabel: 'Seconds later' },
    { id: 'porosity-result', in: ['main', 'x'],
      say: 'Its trend with impedance is weak here, and the band says so: from Q10 to Q90 it holds the wells left out eighty one to a hundred percent of the time.',
      sayMain: 'The band holds the wells left out eighty one to a hundred percent of the time.',
      subMain: 'The band holds the wells left out 81 to 100 percent of the time.',
      do: async (d) => {
        await t(d, 'qi-prop-result').scrollIntoViewIfNeeded();
        await expectText(d, 'qi-prop-result', /Ekene-1\s*126\s*[\d.]+\s*-?[\d.]+\s*83[\s\S]*Ekene-2\s*56\s*[\d.]+\s*-?[\d.]+\s*96[\s\S]*Ekene-3\s*57\s*[\d.]+\s*-?[\d.]+\s*100[\s\S]*Ekene-4\s*57\s*[\d.]+\s*-?[\d.]+\s*81/, 'porosity check');
        await d.highlight('qi-prop-result');
      } },
    { id: 'porosity-run', in: ['x'],
      say: 'The volume is written as three: Q10, Q50 and Q90.',
      do: async (d, shared) => {
        await d.unhighlight();
        shared.values.propReady = await readyCount(d, 'qi-prop-runs');
        await d.click('qi-prop-run');
      },
      wait: async (d, shared) => { await moreReady(d, 'qi-prop-runs', shared.values.propReady); } },
    { id: 'ntg', in: ['x'], // main cut: dropped for length (5:00)
      say: 'Net to gross follows impedance well.',
      sub: 'Net-to-gross follows impedance well.',
      sayMain: 'And net to gross.',
      subMain: 'And net-to-gross.',
      do: async (d, shared) => {
        await d.unhighlight();
        await d.select('qi-prop-kind', { label: 'Net-to-gross from impedance' });
        await d.sleep(800);
        await calibrate(d, shared, /net-to-gross =/);
      },
      wait: async (d, shared) => { await calibrated(d, shared, /net-to-gross =/); },
      waitLabel: 'Seconds later' },
    { id: 'ntg-result', in: ['x'],
      say: 'R squared is zero point six five, but left out, Ekene one correlates only zero point four four, under the gate, so the volume is withheld, with the reason recorded.',
      sub: 'R squared is 0.65, but left out, Ekene-1 correlates only 0.44, under the gate, so the volume is withheld, with the reason recorded.',
      sayMain: 'Net to gross fails the left out gate at Ekene one, so its volume is withheld.',
      subMain: 'Net-to-gross fails the left-out gate at Ekene-1, so its volume is withheld.',
      do: async (d) => {
        const gate = d.page.locator('[data-testid="qi-prop-gate"]').last();
        await gate.scrollIntoViewIfNeeded();
        await expectText(d, 'qi-prop-result', /r squared 0\.65/, 'ntg fit');
        await expectText(d, gate, /net-to-gross volume is withheld: Ekene-1: left-out correlation 0\.44, under 0\.5/, 'ntg gate');
        await d.highlight(gate);
      } },
    { id: 'sw', in: ['x'],
      say: 'Water saturation from impedance alone fails at three of the four wells, so it stays a fluid hypothesis and no volume is written.',
      do: async (d, shared) => {
        await d.unhighlight();
        await d.select('qi-prop-kind', { label: 'Water saturation from impedance' });
        await d.sleep(800);
        await calibrate(d, shared, /water saturation =/);
        await calibrated(d, shared, /water saturation =/);
        const gate = d.page.locator('[data-testid="qi-prop-gate"]').last();
        await gate.scrollIntoViewIfNeeded();
        await expectText(d, gate, /water saturation volume is withheld[\s\S]*Labelled a fluid hypothesis/, 'sw gate');
        await d.highlight(gate);
      } },
    // ------------------------------------------------------------------ maps
    { id: 'maps', in: ['main', 'x'], chapter: 'Maps from the volumes', chapterSub: 'QI Studio · zone maps to the registry',
      say: 'The hydrocarbon sand probability becomes a map of the Ekene Sand, peaking at zero point four four.',
      sub: 'The hydrocarbon sand probability becomes a map of the Ekene Sand, peaking at 0.44.',
      sayMain: 'The hydrocarbon sand probability becomes a map of the Ekene Sand, peaking at zero point four four.',
      subMain: 'The hydrocarbon sand probability becomes a map of the Ekene Sand, peaking at 0.44.',
      do: async (d, shared) => {
        await d.unhighlight();
        if (!(await t(d, 'qi-tab-maps').isVisible().catch(() => false))) await openQiProject(d, shared);
        await d.click('qi-tab-maps');
        await d.sleep(2500);
        await pick(d, 'qi-maps-input', 'probability of Hydrocarbon sand', { last: true });
        await d.sleep(1500);
        await d.select('qi-maps-top', { label: `Top Ekene Sand (on ${FULL})` });
        await d.select('qi-maps-base', { label: `Ekene Sand Base (on ${FULL})` });
        if (cut === 'x') {
          shared.values.mapsBefore = await t(d, 'qi-maps-runs').innerText().catch(() => '');
          await d.click('qi-maps-run');
        } else {
          await t(d, 'qi-maps-runs').scrollIntoViewIfNeeded();
          await expectText(d, 'qi-maps-runs', /probability of Hydrocarbon sand: mean probability[\s\S]*probability\s*13580\s*0\.00\d+\s*0\.1\d+\s*0\.438/, 'map');
          await d.highlight('qi-maps-runs');
        }
      },
      wait: cut === 'x' ? async (d, shared) => {
        for (let i = 0; i < 400; i++) {
          const x = await t(d, 'qi-maps-runs').innerText().catch(() => '');
          if (x !== shared.values.mapsBefore && /Save the maps/.test(x)) { await expectText(d, 'qi-maps-runs', /probability\s*13580\s*0\.00\d+\s*0\.1\d+\s*0\.438/, 'map'); return; }
          await d.sleep(2000);
        }
        throw new Error('the zone maps did not finish');
      } : undefined },
    { id: 'maps-save', in: ['x'],
      say: 'Saved to the surface registry, it opens in Seismolord and in Mapping and Surface Studio.',
      do: async (d) => {
        await t(d, 'qi-maps-runs').scrollIntoViewIfNeeded();
        await d.click(d.page.locator('[data-testid^="qi-maps-save-"]').first());
        await d.page.locator('[data-testid="qi-maps-runs"] >> text=/saved/i').first().waitFor({ timeout: 120000 });
        await d.highlight('qi-maps-runs');
      } },
    { id: 'map-view', in: ['main', 'x'], rampMax: 4,
      say: 'In Seismolord\'s Map window: the hydrocarbon sand probability over the Ekene Sand, contoured and ready for the prospect.',
      sayMain: 'In Seismolord, the probability map, contoured and ready for the prospect.',
      do: async (d, shared) => {
        await d.unhighlight();
        // a zone map is saved against its volume's stack (the near stack here)
        await activate(d, shared, STACKS[0]);
        // the saved probability surface on (the time slice stays under it)
        const names = (await ex(d).locator('div[role=button] span.truncate').allInnerTexts()).map((x) => x.trim());
        const surf = names.findLast((n) => n.includes('probability of Hydrocarbon sand'));
        if (surf) await setVisible(d, surf, true);
        await showWindow(d, 'Map', 'map');
        await d.sleep(2500);
        await d.click(d.page.locator('[data-testid="window-map"] button[title="Fullscreen"]'));
        await d.sleep(1500);
        const opts = await mapSel(d, 0).locator('option').allInnerTexts();
        const v = opts.findLast((o) => o.includes('probability of Hydrocarbon sand'));
        await d.select(mapSel(d, 0), { label: v });
        await d.sleep(4000);
      } },
    // -------------------------------------------------------------- prospect
    { id: 'prospect', in: ['main', 'x'], chapter: 'The prospect', chapterSub: 'QI Studio · trap, evidence and recommendation',
      say: 'The prospect brings it together: the trap from the Ekene Sand depth surface, flooded from the crest to the spill.',
      sayMain: 'The prospect: the trap from the depth surface, the anomaly from that map.',
      do: async (d, shared) => {
        await d.click(d.page.locator('[data-testid="window-map"] button[title="Fullscreen"]'));
        await openQiProject(d, shared);
        await d.click('qi-tab-prospects');
        await d.sleep(2500);
        if (cut === 'x') {
          await d.click('qi-pros-add');
          await d.type('qi-pros-name', 'Ekene rollover', { delay: 45 });
          await d.select(d.page.locator('[data-testid="qi-pros-editor"] select').first(), { label: 'Ekene Sand' });
          const so = await t(d, 'qi-pros-surface').locator('option').allInnerTexts();
          await d.select('qi-pros-surface', { label: so.find((x) => x === 'Ekene Sand (depth ft)') });
          await d.type(d.page.getByLabel('Crest search X'), '400837', { delay: 40 });
          await d.type(d.page.getByLabel('Crest search Y'), '521762', { delay: 40 });
        } else {
          await t(d, 'qi-pros-table').scrollIntoViewIfNeeded();
          await d.highlight('qi-pros-table');
        }
      } },
    { id: 'prospect-evidence', in: ['x'],
      say: 'The anomaly: that probability map, above zero point two. The evidence: the prestack inversion, and the oil in Ekene one.',
      sub: 'The anomaly: that probability map, above 0.2. The evidence: the prestack inversion, and the oil in Ekene-1.',
      do: async (d) => {
        const ao = await t(d, 'qi-pros-attr').locator('option').allInnerTexts();
        await d.select('qi-pros-attr', { label: ao.findLast((x) => x.includes('probability of Hydrocarbon sand')) });
        await d.type('qi-pros-threshold', '0.2', { delay: 60 });
        for (const [name, src] of [['Hydrocarbon sand probability, simultaneous inversion', 'Prestack inversion (Vp/Vs, density)'], ['Oil in Ekene-1', 'Well results (shows, tests, logs)']]) {
          await d.type('qi-pros-ev-name', name, { delay: 25 });
          await d.select('qi-pros-ev-source', { label: src });
          await d.click('qi-pros-ev-add');
        }
        await d.click('qi-pros-analyse');
        await t(d, 'qi-pros-table').waitFor({ timeout: 120000 });
        await d.sleep(2500);
      } },
    { id: 'prospect-result', in: ['main', 'x'],
      say: 'Crest at four thousand nine hundred and fifty six feet, a column of a hundred and twenty five. The anomaly conforms, zero point seven three, with a contact at five thousand and one feet. Recommendation: investigate, with five competing explanations open and the feasibility check next.',
      sub: 'Crest at 4,956 ft, a column of 125. The anomaly conforms, 0.73, with a contact at 5,001 ft. Recommendation: investigate, with five competing explanations open and the feasibility check next.',
      sayMain: 'A column of a hundred and twenty five feet. The anomaly conforms, zero point seven three, with a contact at five thousand and one feet. Recommendation: investigate.',
      subMain: 'A column of 125 ft. The anomaly conforms, 0.73, with a contact at 5,001 ft. Recommendation: investigate.',
      do: async (d) => {
        await t(d, 'qi-pros-table').scrollIntoViewIfNeeded();
        await expectText(d, 'qi-pros-table', /Crest \/ spill \(ft\)[\s\S]*4956 \/ 5082 \(edge\)\s*125\s*4\.72\s*0\.73, 100 percent inside, contact 5001 ft\s*2\s*5 \/ 0[\s\S]*Investigate/, 'prospect');
        await d.highlight('qi-pros-table');
      } },
    { id: 'report', in: ['main', 'x'], chapter: 'The record', chapterSub: 'QI Studio · Report',
      say: 'The report records every run, from the raw SEG-Y to the prospect, in one connected study.',
      sayMain: 'The report records every run, from the raw SEG-Y to the prospect.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('qi-tab-report');
        await d.sleep(2500);
        await d.highlight('qi-report-summary');
      } },
  ];
  return steps.filter((s) => s.in.includes(cut)).map((s) => (cut === 'main' && s.sayMain ? { ...s, say: s.sayMain, sub: s.subMain || s.sub } : s));
}

export {
  windowsToggle, showLine, dialog, SPEC, combo, ex, mapSel, onlyVisible, drag3d, goTo, openQiProject, activate, setVisible,
  showSlicePlanes, closeWindow, fullscreenBtn, readyCount, moreReady, FULL, STACKS, STORE, DEMULT, DENOISED, MULT_MODEL, AREA, RMS_V4, RGB_FREQS,
};
