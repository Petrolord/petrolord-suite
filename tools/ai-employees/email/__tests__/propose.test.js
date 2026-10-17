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

test('the copy carries the repo facts: dates, quiz days, prizes, counts, WhatsApp and /nape', () => {
  const [a, b, c, d] = tasks.map((t) => t.payload.text);
  expect(a).toContain('Monday 9 to Wednesday 11 November 2026');
  expect(a).toContain('105 apps across ten modules');
  expect(b).toMatch(/ZGY/);
  expect(b).toMatch(/Local Workspace/);
  expect(b).toMatch(/QI Studio/);
  expect(b).toContain('80 courses, 73 of them');
  expect(b).toContain('https://www.youtube.com/@PetrolordSuite');
  expect(c).toContain('Day 1: Exploration');
  expect(c).toContain('Day 3: Reservoir Modelling and Field Development');
  expect(c).toContain('50% discount code');
  expect(d).toContain('+234 901 556 6981');
  expect(d).toContain('https://petrolord.com/nape?');
  expect(tasks.map((t) => t.payload.text).join('\n')).not.toMatch(/\bprice|NGN|\$\d|₦/i); // never a price
});
