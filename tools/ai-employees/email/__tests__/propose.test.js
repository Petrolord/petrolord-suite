/**
 * @jest-environment node
 */
import { napeTasks } from '../lib/series.mjs';
import { lagosLabel } from '../../../../src/lib/aiEmailDraft.js';

const tasks = napeTasks({ apps: 105, modulesWord: 'Ten', courses: 80, appCourses: 73 });

test('four email_campaign proposals in order, all status proposed', () => {
  expect(tasks).toHaveLength(4);
  expect(tasks.map((t) => t.kind)).toEqual(Array(4).fill('email_campaign'));
  expect(tasks.map((t) => t.status)).toEqual(Array(4).fill('proposed'));
  expect(tasks.map((t) => t.payload.key)).toEqual(['nape2026-1', 'nape2026-2', 'nape2026-3', 'nape2026-4']);
  for (const t of tasks) expect(t.title).toBe(t.payload.subject);
});

test('each is at 09:00 Lagos time (08:00 UTC) on its day', () => {
  expect(tasks.map((t) => t.payload.scheduled_at)).toEqual([
    '2026-10-21T08:00:00.000Z', '2026-10-28T08:00:00.000Z', '2026-11-04T08:00:00.000Z', '2026-11-08T08:00:00.000Z',
  ]);
  for (const t of tasks) {
    expect(lagosLabel(t.payload.scheduled_at)).toMatch(/09:00 Lagos$/);
    expect(t.payload.timezone).toBe('Africa/Lagos');
  }
});

test('unknown facts are placeholders, listed in the notes and as empty facts', () => {
  const ph = tasks.map((t) => t.payload.placeholders);
  expect([...ph[0]].sort()).toEqual(['[BOOTH NUMBER]', '[VENUE]']);
  expect([...ph[3]].sort()).toEqual(['[BOOTH NUMBER]', '[EXHIBITION OPENING HOURS]', '[VENUE]']);
  for (const t of tasks) {
    const p = t.payload;
    expect(p.placeholders.length).toBeGreaterThan(0);
    expect(p.notes.join('\n')).toContain(`Placeholders to fill: ${p.placeholders.join(', ')}`);
    expect(Object.keys(p.facts).sort()).toEqual([...p.placeholders].sort());
    expect(Object.values(p.facts).every((v) => v === '')).toBe(true);
  }
});

test('only the two allowed audiences; the product email goes to leads who chose those products', () => {
  expect(tasks[0].payload.audience).toEqual(['nape-optins', 'nape-2026-leads']);
  expect(tasks[1].payload.audience).toEqual(['nape-optins', 'nape-2026-leads:suite', 'nape-2026-leads:nextgen']);
});

test('the copy leads with the platform and carries only repo facts', () => {
  const [a, b, c, d] = tasks.map((t) => t.payload.text);
  // email 1: why Petrolord, then the date
  expect(a).toContain('105 apps across ten modules');
  expect(a).toContain('Nothing to install');
  expect(a).toContain('Oilfield units (ft, psi, bbl)');
  expect(a).toContain('Minna');
  expect(a).toContain('Monday 9 to Wednesday 11 November 2026');
  // email 2: a tour of every module, recent features only as proof
  for (const m of ['Geoscience', 'Reservoir', 'Drilling and completion', 'Production', 'Facilities and process safety', 'Midstream and downstream', 'Economics', 'Assurance and data']) expect(b).toContain(`${m}: `);
  expect(b).toContain('SPE 75354');
  expect(b).toContain('Lee (1982) Example 2.1');
  expect(b).toMatch(/ZGY/);
  expect(b).toMatch(/Local Workspace/);
  expect(b).toContain('@PetrolordSuite');
  expect(b.indexOf('Geoscience: ')).toBeLessThan(b.indexOf('ZGY'));
  // email 3: quiz, prizes and what visitors can try
  expect(c).toContain('Day 1: Exploration');
  expect(c).toContain('Day 3: Reservoir Modelling and Field Development');
  expect(c).toContain('50% discount code');
  expect(c).toContain('Try the Suite while you are there');
  expect(c).toContain('free to start');
  // email 4: three reasons and the WhatsApp booking
  expect(d).toContain('three reasons');
  expect(d).toContain('+234 901 556 6981');
  expect(tasks.map((t) => t.payload.text).join('\n')).not.toMatch(/\bprice|NGN|\$\d|₦/i); // never a price
});

test('one call to action per email', () => {
  for (const t of tasks) expect(t.payload.html.match(/bgcolor="#2f6b48"/g)).toHaveLength(1);
  expect(tasks[1].payload.html).toContain('https://wa.me/2349015566981?text=');
  expect(tasks[3].payload.html).toContain('https://wa.me/2349015566981?text=');
});
