// Seismolord lesson B6: tops to horizons (Ekene kit v4, EKENE3D-v4-full.sgy).
// The six Ekene wells and their tops build a framework: the wells are tied
// and one field convention agreed, every top is matched to its event on the
// review board, the growth fault and Ekene East (Auto-1 and Auto-2, picked
// for the sales demos) are the barriers, the framework is tracked and carried
// across them, and the leave-one-well-out check measures the miss at each
// well left out. The prognosis gives where a well meets each horizon (in
// feet since Suite #1022). Nothing is accepted: the project already holds
// the framework from the demos, so the lesson changes nothing in the account.
// Figures from the 2026-10-12 probe.
import {
  login, expectText, openSeismolord, setVisible, closeWindow, deleteFault, FULL,
} from '../seis-common.mjs';
import { seisLessonMeta } from './seis-common.mjs';

const WELLS = ['Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4', 'Ekene-8', 'Ekene-9'];
const t = (d, id) => d.page.getByTestId(id);
const dlg = (d) => t(d, 'sl-tops-to-horizons');
const combo = (d, name) => d.page.getByRole('combobox', { name });
const boardRow = (d, top) => t(d, 't2h-board').locator(`tr:has(input[aria-label="Use ${top}"])`).first();
const resultRow = (d, name) => t(d, 't2h-results').locator(`tr:has(td:text-is("${name}"))`);
const wellRow = (d, name) => dlg(d).locator(`tr:has(td:text-is("${name}"))`).first();
const ex = (d) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');

export default {
  id: 'lesson-seis-b6',
  ...seisLessonMeta(6, 'B', 'Tops to horizons: *the wells build the framework*', 'Tying the wells, matching every top to its event, faults as barriers, and the leave-one-well-out check'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await d.page.getByText('Home', { exact: true }).first().click(); // the ribbon remembers its tab
    await d.sleep(600);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(5000);
    await closeWindow(d, '3D');
    await closeWindow(d, 'Map');
    // faults from other lessons (C7) would join the barriers and change the numbers
    const lessonFaults = (await ex(d).locator('div[role=button] span.truncate').allInnerTexts()).filter((n) => /^Lesson .*fault/i.test(n));
    for (const f of lessonFaults) await deleteFault(d, f);
    const names = await ex(d).locator('div[role=button] span.truncate').allInnerTexts();
    for (const n of names) await setVisible(d, n, false);
    await combo(d, 'Orientation').selectOption({ label: 'Inline' });
    await t(d, 'sl-goto').fill('1027'); await t(d, 'sl-goto-btn').click(); await d.sleep(2000);
    for (const w of WELLS) await setVisible(d, w, true);
    await t(d, 'sl-ribbon-tab-interpretation').click(); await d.sleep(600);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 6', chapterSub: 'Module B · Horizons',
      say: 'The last two lessons tracked one horizon from one seed, and the tracker went wrong at the fault. The wells know where every top is. This lesson lets the wells build the whole framework, with the faults as barriers, and measures how good it is.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module B · Lesson 6', title: 'Tops to horizons',
        body: '<ul><li>Tie every well, agree one convention</li><li>Match each top to its event</li><li>Track with faults as barriers</li><li>Leave each well out, measure the miss</li></ul>' }) },
    { id: 'open', chapter: 'The wells', chapterSub: 'Every visible well with tops',
      say: 'The six Ekene wells are shown on the section. Tops to horizons takes every visible well with tops. Wells with a sonic log are tied to the seismic; Ekene eight and nine use their checkshots.',
      sub: 'The six Ekene wells are shown on the section. Tops to horizons takes every visible well with tops. Wells with a sonic log are tied to the seismic; Ekene-8 and 9 use their checkshots.',
      do: async (d) => {
        await d.hideSlide();
        await d.click(d.page.getByRole('button', { name: 'Tops to horizons' }));
        await dlg(d).waitFor();
        await d.sleep(1500);
        await expectText(d, dlg(d), /Ekene-9\s*9\s*checkshots[\s\S]*Ekene-8\s*9\s*checkshots[\s\S]*Ekene-1\s*10\s*tie/, 'wells and their time-depth');
        await d.highlight(wellRow(d, 'Ekene-8'));
      } },
    { id: 'tie', chapter: 'Tie and match', chapterSub: 'One convention for the field',
      say: 'Tie and match ties each well again and agrees one convention for the field: normal polarity and zero phase, from all six wells, with a tuning thickness of about sixteen milliseconds at twenty seven hertz. Ekene one ties with a correlation of nought point eight four; Ekene eight and nine are fair, at about nought point six.',
      sub: 'Tie and match ties each well again and agrees one convention for the field: normal polarity and zero phase, from all six wells, with a tuning thickness of about 16 ms at 27 Hz. Ekene-1 ties with a correlation of 0.84; Ekene-8 and 9 are fair, at about 0.6.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('t2h-match');
        await t(d, 't2h-board').waitFor({ timeout: 300000 });
        await d.click('t2h-step-wells');
        await d.sleep(800);
        await expectText(d, 't2h-convention', /normal polarity, 0° phase from 6 tied wells\. Tuning thickness about 16\.1 ms at 27 Hz/, 'field convention');
        await expectText(d, wellRow(d, 'Ekene-1'), /good: shift -1\.5 ms, phase 5°, r 0\.84/, 'Ekene-1 tie');
        await expectText(d, wellRow(d, 'Ekene-8'), /fair: shift -0\.7 ms, phase 3°, r 0\.58/, 'Ekene-8 tie');
        await expectText(d, wellRow(d, 'Ekene-9'), /fair: shift 3\.4 ms, phase -11°, r 0\.60/, 'Ekene-9 tie');
        await d.highlight('t2h-convention');
        await d.sleep(3000);
        await d.highlight(wellRow(d, 'Ekene-1'));
      } },
    { id: 'board', chapter: 'The review board', chapterSub: 'Each top, at each well',
      say: 'The review board shows the event each top was matched to at each well, how far it sits from where the tie predicted, and a score. The top of the Ekene Sand is a peak at all six wells, within six milliseconds of the prediction.',
      sub: 'The review board shows the event each top was matched to at each well, how far it sits from where the tie predicted, and a score. The top of the Ekene Sand is a peak at all six wells, within 6 ms of the prediction.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('t2h-step-review');
        await d.sleep(1000);
        await expectText(d, boardRow(d, 'Ekene Sand'), /Peak[\s\S]*-0\.7 ms[\s\S]*1\.4 ms[\s\S]*5\.2 ms[\s\S]*-2\.0 ms[\s\S]*5\.5 ms[\s\S]*1\.8 ms/, 'Ekene Sand row');
        await d.highlight(boardRow(d, 'Ekene Sand'));
      } },
    { id: 'weak', chapter: 'A weak top', chapterSub: 'Leave out what does not match',
      say: 'Not every top makes a good horizon. The base of the Oboro Sand is a zero crossing, with scores of nought point three and nought point one, and no match at all at Ekene one. A horizon built on that would be a guess, so we untick it and leave it out of the framework.',
      sub: 'Not every top makes a good horizon. The base of the Oboro Sand is a zero crossing, with scores of 0.3 and 0.1, and no match at all at Ekene-1. A horizon built on that would be a guess, so we untick it and leave it out of the framework.',
      do: async (d) => {
        await d.unhighlight();
        const row = boardRow(d, 'Oboro Sand Base');
        await row.scrollIntoViewIfNeeded(); await d.sleep(800);
        await expectText(d, row, /Zero \+ to −[\s\S]*2\.1 ms · 0\.33[\s\S]*-2\.2 ms · 0\.13[\s\S]*unmatched/, 'Oboro Sand Base row');
        await d.highlight(row);
        await d.sleep(3500);
        await d.click(row.locator('input[aria-label="Use Oboro Sand Base"]'));
        await d.sleep(800);
      } },
    { id: 'faults', chapter: 'The faults', chapterSub: 'Barriers for tracking',
      say: 'Next, the faults used as barriers. The growth fault and the buried Ekene East fault are already in this project, picked automatically; Module C shows how. Both are ticked, so no horizon is tracked across them.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dlg(d).getByRole('button', { name: 'Next: faults' }));
        await d.sleep(1200);
        const lab = dlg(d).getByText('Faults used as barriers').locator('..');
        await expectText(d, lab, /^Faults used as barriers\s*Auto-2\s*\(auto\)\s*Auto-1\s*\(auto\)$/, 'barrier faults');
        await d.highlight(lab);
      } },
    { id: 'track', chapter: 'Tracking the framework', chapterSub: 'Stopped at the faults, carried across them',
      say: 'Now we track. Each top is tracked from its wells, banded so that no two horizons can cross, and stopped at the faults. Every well is in the hanging wall, so the footwall is reached by carrying each horizon across the fault by the throw the seismic measures. The leave one well out check runs too.',
      sub: 'Now we track. Each top is tracked from its wells, banded so that no two horizons can cross, and stopped at the faults. Every well is in the hanging wall, so the footwall is reached by carrying each horizon across the fault by the throw the seismic measures. The leave-one-well-out check runs too.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dlg(d).getByRole('button', { name: 'Next: track' }));
        await d.sleep(1200);
        await d.highlight(dlg(d).getByText(/Leave-one-well-out check/).locator('..'));
        await d.sleep(1500);
        await d.unhighlight();
        await d.click('t2h-track');
      },
      wait: async (d) => {
        await t(d, 't2h-results').waitFor({ timeout: 900000 });
        await resultRow(d, 'Seabed').waitFor({ timeout: 900000 });
        await d.sleep(1500);
      },
      waitLabel: 'A minute later' },
    { id: 'results', chapter: 'The results', chapterSub: 'One row per horizon',
      say: 'One row per horizon. The Ekene Sand: a peak from six wells, twenty one thousand three hundred and forty traces, ninety nine percent of the survey. Three thousand and fifteen of them are flagged as tuned, where the sand is too thin for its top and base to be told apart. Seven thousand six hundred and forty nine were carried across the fault, on a throw of fifty nine point seven milliseconds.',
      sub: 'One row per horizon. The Ekene Sand: a peak from six wells, 21,340 traces, 99% of the survey. 3,015 of them are flagged as tuned, where the sand is too thin for its top and base to be told apart. 7,649 were carried across the fault, on a throw of 59.7 ms.',
      do: async (d) => {
        const row = resultRow(d, 'Ekene Sand');
        await row.scrollIntoViewIfNeeded(); await d.sleep(800);
        await expectText(d, row, /Peak, 6 wells\s*21340 \(99 %\)\s*3015\s*7649 \(throw 59\.7 ms\)/, 'Ekene Sand result');
        await d.highlight(row);
      } },
    { id: 'lowo', chapter: 'Leave one well out', chapterSub: 'The honest error',
      say: 'The last columns are the honest test. Each horizon is tracked again with one well left out, and the miss is measured at the well that was left out. At the Ekene Sand the miss is zero at all six wells, and the misties at the wells used are three point three milliseconds R M S. The Oboro Sand reaches only three wells, and could be checked at two of them.',
      sub: 'The last columns are the honest test. Each horizon is tracked again with one well left out, and the miss is measured at the well that was left out. At the Ekene Sand the miss is zero at all six wells, and the misties at the wells used are 3.3 ms RMS. The Oboro Sand reaches only three wells, and could be checked at two of them.',
      do: async (d) => {
        await expectText(d, resultRow(d, 'Ekene Sand'), /0\.0 ms over 6\/6 wells\s*3\.3 ms/, 'Ekene Sand leave-one-out');
        await expectText(d, resultRow(d, 'Oboro Sand'), /Peak, 3 wells[\s\S]*0\.0 ms over 2\/3 wells/, 'Oboro Sand leave-one-out');
        await d.highlight(resultRow(d, 'Ekene Sand'));
        await d.sleep(4500);
        await d.highlight(resultRow(d, 'Oboro Sand'));
      } },
    { id: 'prognosis', chapter: 'Prognosis', chapterSub: 'Where a well meets each horizon',
      say: 'The prognosis turns the framework back into depths at a well, in feet, with a band from the leave one well out error. At Ekene eight, the deviated well, the top of the Ekene Sand is at five thousand four hundred and thirty six feet measured depth, five thousand and four point seven feet below sea level. The band is zero, because the miss with each well left out was zero. On a planned well, this is the table the drillers get.',
      sub: 'The prognosis turns the framework back into depths at a well, in feet, with a band from the leave-one-well-out error. At Ekene-8, the deviated well, the top of the Ekene Sand is at 5,436 ft measured depth, 5,004.7 ft below sea level. The band is zero, because the miss with each well left out was zero. On a planned well, this is the table the drillers get.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('t2h-step-prognosis');
        await d.sleep(800);
        await d.select(dlg(d).getByRole('combobox', { name: 'Well' }), { label: 'Ekene-8' });
        await d.sleep(1500);
        await expectText(d, 't2h-prognosis', /MD \(ft\)\s*TVDSS \(ft\)\s*Band \(ft\)/, 'prognosis in feet');
        const row = t(d, 't2h-prognosis').locator('tr:has(td:text-is("Ekene Sand"))');
        await expectText(d, row, /Ekene Sand\s*5436\.0\s*5004\.7\s*± 0\.0/, 'Ekene Sand at Ekene-8');
        await d.highlight(row);
      } },
    { id: 'close', chapter: 'Accept, or not', chapterSub: 'Nothing is saved until you say so',
      say: 'Nothing has been saved. Accept would save every horizon under the name of its top. This project already holds the framework from these wells, so we close the dialog and keep it as it is.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('t2h-step-track');
        await d.sleep(800);
        await t(d, 't2h-accept').scrollIntoViewIfNeeded(); await d.sleep(600);
        await d.highlight('t2h-accept');
        await d.sleep(2500);
        await d.unhighlight();
        await d.click(dlg(d).getByRole('button', { name: 'Close' }).last());
        await d.sleep(800);
      } },
    { id: 'next',
      say: 'That completes Module B. Next, Module C: faults, by hand, automatically, and how horizons cross them.',
      do: async (d) => {
        await d.slide({ eyebrow: 'Next: Module C', title: 'Faults', body: '<ul><li>Fault sticks by hand</li><li>Automatic fault detection</li><li>Horizons across faults</li></ul>' });
        for (const w of WELLS) await setVisible(d, w, false);
        await d.page.getByText('Home', { exact: true }).first().click().catch(() => {});
      } },
  ],
};
