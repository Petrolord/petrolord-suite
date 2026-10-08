// Pipeline smoke test on the public homepage (no login): cursor, ring,
// callout, lower-third, narration sync, captions, both renders.
export default {
  id: 'smoke-home',
  app: 'Petrolord Suite',
  eyebrow: 'Pipeline check',
  title: 'One suite, *every discipline*',
  subtitle: 'A short test of the demo-video pipeline',
  baseUrl: 'https://petrolord.com',
  async setup(d) {
    await d.page.goto('https://petrolord.com/', { waitUntil: 'networkidle' });
    const ok = d.page.getByRole('button', { name: 'OK' });
    if (await ok.isVisible().catch(() => false)) await ok.click();
  },
  steps: [
    { id: 'hero', chapter: 'The Suite', chapterSub: 'petrolord.com',
      say: 'This is the Petrolord Suite. One sign in, ten modules, and over a hundred engineering applications that share one project database.',
      do: async (d) => { await d.moveTo({ x: 600, y: 300 }); await d.highlight(d.page.locator('h1').first()); } },
    { id: 'modules',
      say: 'Each module groups the applications one discipline needs, from seismic interpretation to economics.',
      do: async (d) => { await d.unhighlight(); await d.scroll({ x: 960, y: 600 }, 820); await d.callout('m', d.page.getByText('Geoscience', { exact: false }).nth(2), 'Geoscience and Analytics: twelve applications', 'right'); } },
    { id: 'close',
      say: 'In the videos that follow, we open the applications themselves and work through real analyses, step by step.',
      do: async (d) => { await d.clearCallouts(); await d.moveTo({ x: 1300, y: 700 }); } },
  ],
};
