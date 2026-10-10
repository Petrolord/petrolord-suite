// QI lesson A1: what a QI study asks, and setting one up.
// Figures from the 2026-10-10 probe (kit v3, demo account): six wells with
// surveys, elevations, DTS and checkshots; Ekene-9 has no density; Ekene-8
// has no zones yet; only Ekene-1 carries an Oboro Sand zone.
import { login, expectText } from './common.mjs';
import { qiLessonMeta } from './qi-common.mjs';
import { openQi, clearQiProject, wellBox, volumeBox } from '../qi-common.mjs';

const PROJECT = 'Ekene QI lesson';
const t = (d, id) => d.page.getByTestId(id);
const invRow = (d, label) => d.page.locator('tr').filter({ hasText: label }).first();

export default {
  id: 'lesson-qi-a1',
  ...qiLessonMeta(1, 'A', 'What a QI study asks, *and setting one up*', 'The two questions behind every quantitative interpretation, and a new QI Studio project on the Ekene field'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openQi(d, shared);
    await clearQiProject(d, PROJECT);
    await openQi(d, shared);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 1', chapterSub: 'Module A · Should we do QI here?',
      say: 'Quantitative interpretation turns seismic amplitudes into rock and fluid properties: impedance, Vp over Vs, porosity, the chance that a bright spot is gas. Before any of that, a QI study answers two plain questions. Is the data good enough? And does the rock physics say the seismic can see the difference we care about? This lesson sets up a study to answer them.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module A · Lesson 1', title: 'What a QI study asks',
        body: '<ul><li><b>Is the data good enough?</b> Logs, ties, seismic quality</li><li><b>Can the seismic see it?</b> The rock physics answer</li><li>Only then: AVO, inversion, properties</li></ul>' }) },
    { id: 'why', chapter: 'Feasibility first', chapterSub: 'Why the order matters',
      say: 'The order matters. An inversion always returns a volume, whether or not the fluid changes the rock enough to be seen, and whether or not the wells are tied. A feasibility study done first tells you which questions the seismic can answer, so the expensive work goes where it can succeed.',
      do: async (d) => d.slide({ eyebrow: 'Feasibility first', title: 'An inversion always returns an answer',
        body: '<ul><li>No tie, wrong wavelet: a confident wrong volume</li><li>Fluid effect below the noise: nothing to find</li><li>Feasibility decides <b>which route</b>, or none</li></ul>' }) },
    { id: 'new', chapter: 'A new study', chapterSub: 'QI Studio · Setup',
      say: 'In QI Studio we create a project for the Ekene field. A project holds the study\'s choices, its runs and its decisions, and it saves as you work.',
      do: async (d) => {
        await d.hideSlide();
        await d.click(d.page.getByRole('button', { name: 'Create new project' }));
        await d.type(d.page.getByRole('textbox', { name: 'Project name' }), PROJECT);
        await d.click(d.page.getByRole('button', { name: 'Create project' }));
        await d.sleep(1500);
      } },
    { id: 'wells',
      say: 'The wells come from the shared well registry, the same wells Well Data Manager and Petrophysics Studio use. Nothing is imported twice. We take all six Ekene wells, including Ekene eight, the deviated well from the platform, and Ekene nine, which was logged without a density tool.',
      sub: 'The wells come from the shared well registry, the same wells Well Data Manager and Petrophysics Studio use. Nothing is imported twice. We take all six Ekene wells, including Ekene-8, the deviated well from the platform, and Ekene-9, which was logged without a density tool.',
      do: async (d) => {
        for (const w of ['Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4', 'Ekene-8', 'Ekene-9']) await d.click(wellBox(d, w), { after: 120 });
      } },
    { id: 'targets',
      say: 'Targets are matched by zone name on every chosen well. The zones are the ones defined in Petrophysics Studio. We study two: the Ekene Sand, the oil reservoir, and the deeper Oboro Sand, which carries gas.',
      do: async (d) => {
        await d.sleep(800);
        await d.click(t(d, 'qi-target-Ekene Sand'));
        await d.click(t(d, 'qi-target-Oboro Sand'));
        await d.highlight(d.page.getByText('Target intervals').locator('..'));
      } },
    { id: 'seismic',
      say: 'Then the seismic, read from Seismolord: the full stack, and the near, mid and far angle stacks.',
      do: async (d) => {
        await d.unhighlight();
        for (const v of ['EKENE3D-full.sgy', 'EKENE3D-near.sgy', 'EKENE3D-mid.sgy', 'EKENE3D-far.sgy']) await d.click(volumeBox(d, v), { after: 120 });
      } },
    { id: 'dates', chapter: 'The dates', chapterSub: 'Seismic against production',
      say: 'The dates matter more than they look. If the seismic was shot after a well started producing, pressure and saturation near that well have changed, and the amplitudes there no longer match the logs. Say the survey was acquired in June twenty eighteen, and Ekene one came on stream in March twenty fifteen.',
      sub: 'The dates matter more than they look. If the seismic was shot after a well started producing, pressure and saturation near that well have changed, and the amplitudes there no longer match the logs. Say the survey was acquired in June 2018, and Ekene-1 came on stream in March 2015.',
      do: async (d) => {
        const dates = d.page.locator('input[type="date"]');
        await d.highlight(dates.nth(0));
        await dates.nth(0).fill('2018-06-01'); await d.sleep(600);
        await dates.nth(1).fill('2015-03-01'); await d.sleep(600);
      } },
    { id: 'inventory', chapter: 'The data inventory', chapterSub: 'What was asked for, and what came',
      say: 'The data inventory lists every group of data a QI study asks for. Where the Suite already holds the data, the state is suggested from the registries: six of six wells have a survey, a shear log and checkshots; five of six have density and sonic; four of six have a petrophysical interpretation.',
      sub: 'The data inventory lists every group of data a QI study asks for. Where the Suite already holds the data, the state is suggested from the registries: 6 of 6 wells have a survey, a shear log and checkshots; 5 of 6 have density and sonic; 4 of 6 have a petrophysical interpretation.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('qi-tab-inventory');
        await expectText(d, invRow(d, 'Shear sonic'), /6 of 6 wells have a shear log/, 'shear inventory');
        await expectText(d, invRow(d, 'Conventional logs'), /5 of 6 wells have density and sonic/, 'density inventory');
        await expectText(d, invRow(d, 'Petrophysical interpretation'), /4 of 6 wells have porosity and Sw/, 'petro inventory');
        await d.highlight(invRow(d, 'Conventional logs'));
      } },
    { id: 'states',
      say: 'Each line is yours to set: requested, received, usable, missing or outstanding, with the date it arrived and a note. Core, pressure and fluid samples, production history and processing reports are not in the Suite yet, so they stay for you to track. The inventory is the study\'s record of what it was built on.',
      do: async (d) => {
        await d.unhighlight();
        await d.highlight(invRow(d, 'Core data'));
      } },
    { id: 'next',
      say: 'Next lesson, the usability matrix grades every well against every target, and turns each gap into an issue with a remedy.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'Next', title: 'The usability matrix', body: '<ul><li>Every well against every target</li><li>The reason behind each grade</li><li>Gaps become issues with remedies</li></ul>' });
      } },
  ],
};
