// Seismolord lesson F17: projects, sharing and sessions (Ekene kit v4).
// A lesson project ("Lesson team project", an explorer folder) and the
// Move to project menu on the lesson's own attribute volume from E13
// ("Lesson spectral 30 Hz", shown, not moved: attribute volumes nest under
// their parent, so a moved one would not appear in the folder); its
// sharing and history panel; sharing a volume with the organisation and
// making it private again; a named session and a bookmark ("Lesson review",
// "Lesson crest"). Setup removes all of them, and the demo volumes, horizons
// and faults are never moved or shared. Figures from the 2026-10-12 probe.
import { login, expectText, openSeismolord, setVisible, closeWindow, explorerItem, explorerRow, FULL } from '../seis-common.mjs';
import { seisLessonMeta } from './seis-common.mjs';

const PROJECT = 'Lesson team project';
const VOL = 'Lesson spectral 30 Hz';
const SESSION = 'Lesson review';
const BOOKMARK = 'Lesson crest';
const t = (d, id) => d.page.getByTestId(id);
const combo = (d, name) => d.page.getByRole('combobox', { name });
const dialog = (d) => d.page.getByRole('dialog');
const ex = (d) => d.page.locator('div:has(> div > span:text-is("Seismic Explorer"))');
const tab = (d, name) => d.page.getByText(name, { exact: true }).first();
let promptAnswer = PROJECT;

/** The explorer scrolls sideways; menus fail on a clipped row. */
async function explorerLeft(d) {
  await ex(d).evaluate((el) => { for (const n of el.querySelectorAll('*')) if (n.scrollLeft) n.scrollLeft = 0; });
}

async function openSessions(d, onCamera = true) {
  if (onCamera) await d.click(d.page.getByRole('button', { name: 'Sessions' }));
  else await d.page.getByRole('button', { name: 'Sessions' }).click();
  await dialog(d).getByText('Sessions & bookmarks').waitFor();
  await d.sleep(1000);
}

/** Off camera: remove an earlier take's lesson sessions, bookmarks and project. */
async function cleanup(d) {
  await openSessions(d, false);
  for (const nm of [SESSION, BOOKMARK]) {
    for (let i = 0; i < 4; i++) {
      const row = dialog(d).locator('div.rounded-md').filter({ hasText: new RegExp(`^${nm}`) }).first();
      if (!(await row.count())) break;
      await row.getByRole('button', { name: 'Delete' }).click();
      await d.sleep(1500);
    }
  }
  await dialog(d).getByRole('button', { name: 'Close' }).last().click();
  await d.sleep(600);
  await explorerLeft(d);
  for (let i = 0; i < 3; i++) {
    const row = explorerRow(d, PROJECT);
    if (!(await row.count())) break;
    await row.click({ button: 'right' });
    await d.sleep(500);
    await d.page.getByText('Delete project (volumes stay)…').click();
    await d.sleep(2500);
  }
  if (await explorerItem(d, VOL).count()) {
    await explorerItem(d, VOL).click({ button: 'right' });
    await d.sleep(500);
    const priv = d.page.getByText('Make private', { exact: true });
    if (await priv.count()) { await priv.click(); await d.sleep(2000); } else await d.page.keyboard.press('Escape');
  }
}

export default {
  id: 'lesson-seis-f17',
  ...seisLessonMeta(17, 'F', 'Projects, sharing *and sessions*', 'Working on one survey as a team: project folders, sharing with your organisation, history, sessions and bookmarks'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => (dg.type() === 'prompt' ? dg.accept(promptAnswer) : dg.accept()).catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await tab(d, 'Home').click(); // the ribbon remembers its tab
    await d.sleep(600);
    await combo(d, 'Active volume').selectOption({ label: FULL });
    await d.sleep(5000);
    await closeWindow(d, '3D');
    await closeWindow(d, 'Map');
    await cleanup(d);
    if (!(await explorerItem(d, VOL).count())) throw new Error(`${VOL} is missing: record lesson E13 first`);
    const names = await ex(d).locator('div[role=button] span.truncate').allInnerTexts();
    for (const n of names) if (!/^(Inline|Crossline|Time slice)/.test(n)) await setVisible(d, n, false);
    await combo(d, 'Orientation').selectOption({ label: 'Inline' });
    await t(d, 'sl-goto').fill('1053'); await t(d, 'sl-goto-btn').click(); await d.sleep(1500);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 17', chapterSub: 'Module F · Delivery',
      say: 'A survey is rarely interpreted by one person. The geophysicist picks the framework, a colleague works the faults, a manager reviews. This lesson covers how Seismolord keeps that work organised and shared: projects, sharing with your organisation, history, and sessions.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module F · Lesson 17', title: 'Projects, sharing and sessions',
        body: '<ul><li>Projects: folders in the explorer</li><li>Sharing with your organisation</li><li>History: who saved what, when</li><li>Sessions and bookmarks</li></ul>' }) },
    { id: 'project', chapter: 'Projects', chapterSub: 'Folders in the explorer',
      say: 'A project is a folder in the explorer, to keep a study\'s volumes together. New project, and a name. A volume is filed under it from the volume\'s own menu, Move to project, and the volumes themselves never change.',
      sub: 'A project is a folder in the explorer, to keep a study\'s volumes together. New project, and a name. A volume is filed under it from the volume\'s own menu, Move to project, and the volumes themselves never change.',
      do: async (d) => {
        await d.hideSlide();
        promptAnswer = PROJECT;
        await explorerLeft(d);
        await d.click(d.page.locator('button[title="New project (explorer grouping)…"]'));
        await explorerRow(d, PROJECT).waitFor({ timeout: 20000 });
        await d.sleep(1200);
        await explorerLeft(d);
        await d.moveTo(explorerItem(d, VOL));
        await explorerItem(d, VOL).click({ button: 'right' });
        await d.sleep(600);
        await d.page.getByText('Move to project', { exact: true }).hover();
        await d.moveTo(d.page.getByText('Move to project', { exact: true }));
        await d.sleep(800);
        await d.highlight(d.page.locator('[role=menu]').last());
        await d.sleep(2500);
        await d.unhighlight();
        await d.page.keyboard.press('Escape');
        await d.page.keyboard.press('Escape');
        await d.sleep(500);
        await explorerLeft(d);
        await d.highlight(explorerRow(d, PROJECT));
      } },
    { id: 'sharing', chapter: 'Sharing', chapterSub: 'With your organisation',
      say: 'Everything starts private. The project\'s sharing panel shares the folder with your organisation, and its history says who last saved it and when. A colleague sees the folder, and inside it the volumes that are themselves shared.',
      do: async (d) => {
        await d.unhighlight();
        await explorerLeft(d);
        await d.click(explorerRow(d, PROJECT).locator('button[data-testid="seis-project-share"]'));
        await t(d, 'seis-project-sharing').waitFor();
        await d.sleep(1000);
        await expectText(d, t(d, 'seis-project-sharing'), /Share with my organisation[\s\S]*Last saved by you at \d\d:\d\d/, 'sharing panel');
        await d.highlight(t(d, 'seis-project-sharing').getByText('Share with my organisation').locator('..').locator('..'));
      } },
    { id: 'volume', chapter: 'Volumes, one by one', chapterSub: 'Share, then make private',
      say: 'Volumes are shared one at a time, from their menu, and with a volume go the horizons and faults on it, each still owned by the interpreter who made it, read only for everyone else. Share with organisation, and Make private takes it back.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: 'Close' }).last());
        await d.sleep(800);
        await explorerLeft(d);
        await d.moveTo(explorerItem(d, VOL));
        await explorerItem(d, VOL).click({ button: 'right' });
        await d.sleep(600);
        await d.highlight(d.page.getByText('Share with organization', { exact: true }));
        await d.sleep(2500);
        await d.unhighlight();
        await d.page.keyboard.press('Escape');
        await d.sleep(500);
      } },
    { id: 'history', chapter: 'History', chapterSub: 'Versions and who made them',
      say: 'Horizons keep their own history, as lesson five showed: every version, who saved it, and a restore. On a shared volume that is how a team sees whose interpretation is whose.',
      do: async (d) => {
        await explorerLeft(d);
        const hz = explorerItem(d, 'Lesson Ekene correlation');
        await d.moveTo(hz);
        await hz.click({ button: 'right' });
        await d.sleep(700);
        await d.page.getByText(/^History \(/).hover();
        await d.sleep(1000);
        await d.highlight(d.page.locator('[role=menu]').last());
        await d.sleep(2500);
        await d.unhighlight();
        await d.page.keyboard.press('Escape');
        await d.page.keyboard.press('Escape');
        await d.sleep(500);
      } },
    { id: 'session', chapter: 'Sessions', chapterSub: 'The whole workspace, saved',
      say: 'A session saves the whole workspace: the volume, the line, the display settings, the layers, the windows and the cameras. Save current, name it, and anyone reopening it lands exactly where you left off.',
      do: async (d) => {
        await openSessions(d);
        promptAnswer = SESSION;
        await d.click(dialog(d).getByRole('button', { name: /Save current/ }));
        await dialog(d).getByText(SESSION, { exact: true }).waitFor({ timeout: 20000 });
        await d.sleep(800);
        await d.highlight(dialog(d).getByText(SESSION, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-md")][1]'));
      } },
    { id: 'bookmark', chapter: 'Bookmarks', chapterSub: 'One view, one click',
      say: 'A bookmark is lighter: a volume, a line and a camera position. Bookmark view saves the crest line, and one click comes back to it from anywhere.',
      do: async (d) => {
        await d.unhighlight();
        promptAnswer = BOOKMARK;
        await d.click(dialog(d).getByRole('button', { name: /Bookmark view/ }));
        await dialog(d).getByText(BOOKMARK, { exact: true }).waitFor({ timeout: 20000 });
        await d.sleep(800);
        await d.highlight(dialog(d).getByText(BOOKMARK, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-md")][1]'));
        await d.sleep(2000);
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: 'Close' }).last());
        await d.sleep(600);
      } },
    { id: 'next',
      say: 'Next, the last lesson: 2D lines, and the path for very large surveys on the seismic worker.',
      do: async (d) => d.slide({ eyebrow: 'Next', title: '2D lines and large surveys', body: '<ul><li>Importing 2D SEG-Y</li><li>Lines beside the 3D</li><li>Very large volumes on the server</li></ul>' }) },
  ],
};
