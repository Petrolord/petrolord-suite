// Shared by the "Earth Modelling with Petrolord" lessons (Earth Modeling on
// the Ekene kit v4, oilfield units). No subtitles (YouTube captions them).
// Lessons stack the booked six-well maps and never change registry data;
// anything a lesson saves or publishes is named "Lesson ..." and its setup
// removes it first.
export * from '../em-common.mjs';

export const EM_SERIES = 'Earth Modelling with Petrolord';
export const emLessonMeta = (n, module, title, subtitle) => ({
  captions: false,
  viewport: { w: 1440, h: 810 },
  app: EM_SERIES,
  eyebrow: `${EM_SERIES} · Module ${module} · Lesson ${n}`,
  title,
  subtitle,
  outroTitle: 'Follow along with *the same data*',
  outroSub: 'The Ekene demonstration kit is linked in the description · petrolord.com',
});

/** Pick a section from one well to another by name (off the toolbar selects). */
export async function sectionPair(d, a, b, { onCamera = true } = {}) {
  const ids = await d.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-testid="em-sec-b"] option')].map((o) => [o.textContent, o.value])));
  const sel = (id, v) => (onCamera ? d.select(d.page.getByTestId(id), v) : d.page.getByTestId(id).selectOption(v));
  await sel('em-sec-a', ids[a]);
  await d.sleep(400);
  await sel('em-sec-b', ids[b]);
  await d.sleep(800);
}
