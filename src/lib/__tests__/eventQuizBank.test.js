/**
 * @jest-environment node
 */
// The question bank for the Petrolord Upstream Challenge
// (tools/nape/quiz-bank.json) and the migration generated from it.
import fs from 'fs';
import path from 'path';
import { buildSeedSql } from '../../../tools/nape/quizSeed.mjs';
import { drawQuestions, nextTiebreak, seededRandom, DAYS } from '@/lib/eventQuiz';

const root = path.join(__dirname, '../../..');
const bank = JSON.parse(fs.readFileSync(path.join(root, 'tools/nape/quiz-bank.json'), 'utf8'));
const seed = fs.readFileSync(path.join(root, 'supabase/migrations/20261011090100_event_quiz_bank.sql'), 'utf8');

test('every question is well formed', () => {
  const ids = new Set();
  for (const q of bank) {
    expect(q.id).toMatch(/^[A-Z0-9-]{3,20}$/);
    expect(ids.has(q.id)).toBe(false);
    ids.add(q.id);
    expect([1, 2, 3]).toContain(q.day_no);
    expect(['main', 'tiebreak']).toContain(q.kind);
    expect(q.difficulty).toBeGreaterThanOrEqual(1);
    expect(q.difficulty).toBeLessThanOrEqual(5);
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
    expect(q.answer_index).toBeGreaterThanOrEqual(0);
    expect(q.answer_index).toBeLessThanOrEqual(3);
    expect(q.prompt.length).toBeLessThanOrEqual(120); // readable on a phone inside 20 seconds
    for (const o of q.options) expect(o.length).toBeLessThanOrEqual(80);
    expect(q.explanation.length).toBeGreaterThan(10);
    expect(['nextgen', 'petrolord']).toContain(q.source);
    if (q.source === 'nextgen') expect(q.origin).toMatch(/^nextgen:[a-z]+\/(beginner|intermediate|advanced)\/m\d\d-[a-z0-9-]+\/\d+$/);
  }
});

test('copy style: no em or en dashes and no "X, not Y" contrasts', () => {
  for (const q of bank) {
    const text = [q.prompt, q.explanation, ...q.options].join(' ');
    expect(text).not.toMatch(/[–—]/);
    expect(text).not.toMatch(/, not /);
  }
});

test('each day has 40+ main questions across modules and the full difficulty range', () => {
  const themes = { 1: ['Geoscience', 'Economics', 'Drilling'], 2: ['Production', 'Drilling', 'Facilities'], 3: ['Reservoir', 'Economics', 'Facilities'] };
  for (const day of [1, 2, 3]) {
    const main = bank.filter((q) => q.day_no === day && q.kind === 'main');
    expect(main.length).toBeGreaterThanOrEqual(40);
    for (const m of themes[day]) expect(main.some((q) => q.module === m)).toBe(true);
    for (let d = 1; d <= 5; d += 1) expect(main.filter((q) => q.difficulty === d).length).toBeGreaterThanOrEqual(5);
    expect(bank.some((q) => q.day_no === day && q.source === 'nextgen')).toBe(true);
    expect(DAYS[day]).toBeTruthy();
  }
});

test('each day has a tie-breaker pool that gets harder', () => {
  for (const day of [1, 2, 3]) {
    const tb = bank.filter((q) => q.day_no === day && q.kind === 'tiebreak');
    expect(tb.length).toBeGreaterThanOrEqual(6);
    expect(Math.min(...tb.map((q) => q.difficulty))).toBeGreaterThanOrEqual(3);
    // three rounds for the same tied pair climb 3, 4, 5
    const asked = [];
    let after = 0;
    const seen = [];
    for (let i = 0; i < 3; i += 1) {
      const q = nextTiebreak(tb, asked, { after, rng: seededRandom(i) });
      asked.push(q.id);
      seen.push(q.difficulty);
      after = q.difficulty;
    }
    expect(seen).toEqual([3, 4, 5]);
    // and a second tie the same day can climb again with what is left
    const again = nextTiebreak(tb, asked, { after: 0, rng: seededRandom(9) });
    expect(again.difficulty).toBe(3);
  }
});

test('a real game can be drawn on every day without repeating a question', () => {
  for (const day of [1, 2, 3]) {
    const pool = bank.filter((q) => q.day_no === day);
    const ids = drawQuestions(pool, { rng: seededRandom(day) }).map((q) => q.id);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
    for (const id of ids) expect(id.startsWith(`D${day}-`)).toBe(true);
  }
});

test('the committed seed migration is generated from the JSON (rebuild: node tools/nape/build_quiz_seed.mjs)', () => {
  expect(seed).toBe(buildSeedSql(bank));
  expect(seed).toMatch(/on conflict \(id\) do update set/);
  expect(seed).toMatch(/update public\.event_quiz_questions set active = false where id not in/);
});
