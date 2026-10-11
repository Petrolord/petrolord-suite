// The booth quiz rules: scoring, the draw, tie-breakers, the podium and the
// phone's offline answer queue (src/lib/eventQuiz.js).
import {
  SCORE, scoreAnswer, drawQuestions, nextTiebreak, lastTiebreakLevel, rankPlayers, podium, makeComparator, seededRandom,
  validateJoin, questionPhase, secondsLeft, clockOffset, sendAnswer, loadPending, loadPlayer, savePlayer,
  dayForDate, certificateTitle, PRIZES, QUIZ_TITLE, DAYS, DEFAULT_MIX,
} from '@/lib/eventQuiz';

const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

describe('scoring', () => {
  test('a wrong answer scores nothing however fast', () => {
    expect(scoreAnswer(false, 0, 20000)).toBe(0);
  });
  test('a correct answer scores 1000 at once, 750 halfway and 500 at the buzzer', () => {
    expect(scoreAnswer(true, 0, 20000)).toBe(1000);
    expect(scoreAnswer(true, 10000, 20000)).toBe(750);
    expect(scoreAnswer(true, 20000, 20000)).toBe(500);
  });
  test('faster correct answers always score more', () => {
    expect(scoreAnswer(true, 1200, 20000)).toBeGreaterThan(scoreAnswer(true, 1300, 20000));
  });
  test('the grace second after the buzzer scores the floor, and a negative time is clamped', () => {
    expect(scoreAnswer(true, 20900, 20000)).toBe(SCORE.base);
    expect(scoreAnswer(true, -50, 20000)).toBe(SCORE.base + SCORE.speed);
  });
});

const bankOf = (spec) => spec.flatMap(([d, module, n]) => Array.from({ length: n }, (_, i) => ({ id: `${module}-${d}-${i}`, kind: 'main', difficulty: d, module })));

describe('the draw', () => {
  const bank = bankOf([
    [1, 'Geo', 4], [1, 'Eco', 4], [2, 'Geo', 4], [2, 'Eco', 4], [3, 'Geo', 4], [3, 'Eco', 4], [3, 'Dri', 2],
    [4, 'Geo', 3], [4, 'Eco', 3], [5, 'Geo', 3], [5, 'Dri', 3],
  ]);

  test('takes the mix by difficulty, ordered from easy to hard', () => {
    const got = drawQuestions(bank, { rng: seededRandom(1) });
    expect(got).toHaveLength(12);
    const count = (d) => got.filter((q) => q.difficulty === d).length;
    for (const [d, n] of Object.entries(DEFAULT_MIX)) expect(count(Number(d))).toBe(n);
    const diffs = got.map((q) => q.difficulty);
    expect(diffs).toEqual([...diffs].sort((a, b) => a - b));
  });

  test('spreads each difficulty across modules', () => {
    const got = drawQuestions(bank, { rng: seededRandom(7) });
    const d3 = got.filter((q) => q.difficulty === 3).map((q) => q.module);
    expect(new Set(d3).size).toBe(3); // three questions, three modules available
    const d1 = got.filter((q) => q.difficulty === 1).map((q) => q.module);
    expect(new Set(d1).size).toBe(2);
  });

  test('never repeats a question and skips used and excluded ones', () => {
    const marked = bank.map((q, i) => (i % 5 === 0 ? { ...q, used: true } : q));
    const got = drawQuestions(marked, { rng: seededRandom(3), exclude: ['Geo-2-0'] });
    const ids = got.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of got) expect(q.used).toBeFalsy();
    expect(ids).not.toContain('Geo-2-0');
  });

  test('fills a short difficulty from the nearest neighbour', () => {
    const thin = bankOf([[1, 'Geo', 2], [2, 'Geo', 3], [3, 'Geo', 3], [4, 'Geo', 6], [5, 'Geo', 0]]);
    const got = drawQuestions(thin, { rng: seededRandom(5) });
    expect(got).toHaveLength(12);
    expect(got.filter((q) => q.difficulty === 4)).toHaveLength(4); // 2 of its own plus 2 for the missing 5s
  });

  test('stand-ins for a missing difficulty still play in easy-to-hard order', () => {
    const noTwos = bankOf([[1, 'Geo', 6], [3, 'Geo', 6], [4, 'Geo', 3], [5, 'Geo', 3]]);
    const diffs = drawQuestions(noTwos, { rng: seededRandom(9) }).map((q) => q.difficulty);
    expect(diffs).toHaveLength(12);
    expect(diffs).toEqual([...diffs].sort((a, b) => a - b));
  });

  test('a seeded draw repeats and a different seed differs', () => {
    const a = drawQuestions(bank, { rng: seededRandom(42) }).map((q) => q.id);
    const b = drawQuestions(bank, { rng: seededRandom(42) }).map((q) => q.id);
    const c = drawQuestions(bank, { rng: seededRandom(43) }).map((q) => q.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  test('tie-breakers are left out of the main draw', () => {
    const got = drawQuestions([...bank, { id: 'TB', kind: 'tiebreak', difficulty: 3, module: 'Geo' }], { rng: seededRandom(1) });
    expect(got.map((q) => q.id)).not.toContain('TB');
  });
});

describe('tie-breaker questions', () => {
  const tbs = [
    { id: 'T3a', kind: 'tiebreak', difficulty: 3 }, { id: 'T3b', kind: 'tiebreak', difficulty: 3 },
    { id: 'T4a', kind: 'tiebreak', difficulty: 4 }, { id: 'T5a', kind: 'tiebreak', difficulty: 5 },
    { id: 'M1', kind: 'main', difficulty: 1 },
  ];
  test('a fresh tie starts with the easiest; players still tied get a harder one each round', () => {
    const played = [];
    const asked = [];
    const seen = [];
    for (let i = 0; i < 3; i += 1) {
      const q = nextTiebreak(tbs, asked, { after: lastTiebreakLevel(played, ['x', 'y']), rng: seededRandom(i) });
      asked.push(q.id);
      seen.push(q.difficulty);
      played.push({ eligible: ['x', 'y', 'z'].slice(0, 3 - i), difficulty: q.difficulty });
    }
    expect(seen).toEqual([3, 4, 5]);
  });
  test('a different set of tied players starts easy again', () => {
    const played = [{ eligible: ['x', 'y'], difficulty: 4 }];
    expect(lastTiebreakLevel(played, ['x', 'y'])).toBe(4);
    expect(lastTiebreakLevel(played, ['p', 'q'])).toBe(0);
    expect(nextTiebreak(tbs, ['T4a'], { after: lastTiebreakLevel(played, ['p', 'q']), rng: seededRandom(2) }).difficulty).toBe(3);
  });
  test('never ask a main question or one already asked, and run out cleanly', () => {
    expect(nextTiebreak(tbs, ['T3a', 'T3b', 'T4a', 'T5a'])).toBeNull();
    const q = nextTiebreak(tbs, ['T3a', 'T4a', 'T5a'], { after: 5, rng: seededRandom(1) });
    expect(q.id).toBe('T3b'); // the only one left, even though it is easier
  });
});

const P = (id, points, nickname = id) => ({ id, nickname, points });

describe('ranking and the podium', () => {
  test('orders by points and shares a rank only while still tied', () => {
    const r = rankPlayers([P('a', 900), P('b', 1500), P('c', 900), P('d', 300)]);
    expect(r.map((p) => [p.id, p.rank])).toEqual([['b', 1], ['a', 2], ['c', 2], ['d', 4]]);
  });

  test('a clear top three is final', () => {
    const pod = podium(rankPlayers([P('a', 3000), P('b', 2000), P('c', 1000), P('d', 400)]));
    expect(pod.final).toBe(true);
    expect(pod.winners.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  test('a tie that straddles a podium place must be broken', () => {
    const r = rankPlayers([P('a', 3000), P('b', 2000), P('c', 1000), P('d', 1000)]);
    const pod = podium(r);
    expect(pod.final).toBe(false);
    expect(pod.ties).toHaveLength(1);
    expect(pod.ties[0].from).toBe(3);
    expect(pod.ties[0].players.map((p) => p.id).sort()).toEqual(['c', 'd']);
  });

  test('a tie inside the podium matters too (1st and 2nd prizes differ)', () => {
    const pod = podium(rankPlayers([P('a', 2000), P('b', 2000), P('c', 1000)]));
    expect(pod.final).toBe(false);
    expect(pod.ties[0].from).toBe(1);
  });

  test('a tie below the podium does not matter', () => {
    const pod = podium(rankPlayers([P('a', 4000), P('b', 3000), P('c', 2000), P('d', 900), P('e', 900)]));
    expect(pod.final).toBe(true);
    expect(pod.winners.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  test('only players who scored can win', () => {
    const pod = podium(rankPlayers([P('a', 800), P('b', 0), P('c', 0)]));
    expect(pod.final).toBe(true);
    expect(pod.winners.map((p) => p.id)).toEqual(['a']);
  });

  test('a tie-breaker separates only the players who played it', () => {
    const players = [P('a', 3000), P('b', 2000), P('c', 1000), P('d', 1000), P('e', 1000)];
    const tb = [{ seq: 13, eligible: ['c', 'd', 'e'], points: { d: 950, c: 0 }, revealed: true }];
    const r = rankPlayers(players, tb);
    expect(r.map((p) => p.id)).toEqual(['a', 'b', 'd', 'c', 'e']);
    const pod = podium(r, 3, tb);
    expect(pod.final).toBe(true);
    expect(pod.winners.map((p) => p.id)).toEqual(['a', 'b', 'd']);
  });

  test('players still level after a tie-breaker go to another, harder one', () => {
    const players = [P('a', 2000), P('b', 2000), P('c', 2000)];
    const round1 = { seq: 13, eligible: ['a', 'b', 'c'], points: { a: 900 }, revealed: true }; // b and c both wrong
    let pod = podium(rankPlayers(players, [round1]), 3, [round1]);
    expect(pod.final).toBe(false);
    expect(pod.ties[0].from).toBe(2);
    expect(pod.ties[0].players.map((p) => p.id).sort()).toEqual(['b', 'c']);
    const round2 = { seq: 14, eligible: ['b', 'c'], points: { c: 700, b: 600 }, revealed: true };
    pod = podium(rankPlayers(players, [round1, round2]), 3, [round1, round2]);
    expect(pod.final).toBe(true);
    expect(pod.winners.map((p) => p.id)).toEqual(['a', 'c', 'b']);
  });

  test('an unrevealed tie-breaker changes nothing yet', () => {
    const players = [P('a', 1000), P('b', 1000)];
    const open = [{ seq: 13, eligible: ['a', 'b'], points: { a: 900 }, revealed: false }];
    expect(podium(rankPlayers(players, open), 3, open).final).toBe(false);
  });

  test('a tie-breaker score never counts for someone who was not in it', () => {
    const cmp = makeComparator([{ seq: 1, eligible: ['x', 'y'], points: { x: 900, z: 999 }, revealed: true }]);
    expect(cmp(P('y', 500), P('z', 500))).toBe(0);
  });

  test('removed players are left out', () => {
    const r = rankPlayers([P('a', 900), { ...P('b', 5000), kicked: true }]);
    expect(r.map((p) => p.id)).toEqual(['a']);
  });
});

describe('the phone', () => {
  test('joining needs a nickname, a phone number we can reach and consent', () => {
    expect(validateJoin({ nickname: 'Ada', phone: '0803 123 4567', consent: true })).toEqual({});
    const e = validateJoin({ nickname: ' A ', phone: '123', consent: false });
    expect(Object.keys(e).sort()).toEqual(['consent', 'nickname', 'phone']);
    expect(validateJoin({ nickname: 'x'.repeat(21), phone: '08031234567', consent: true }).nickname).toBeTruthy();
  });

  test('question phases follow the server clock, corrected by the offset', () => {
    const q = { starts_at: '2026-11-09T13:00:03.000Z', ends_at: '2026-11-09T13:00:23.000Z', revealed: false };
    const at = (iso) => Date.parse(iso);
    expect(questionPhase(q, 0, at('2026-11-09T13:00:02.000Z'))).toBe('ready');
    expect(questionPhase(q, 0, at('2026-11-09T13:00:04.000Z'))).toBe('open');
    expect(questionPhase(q, 0, at('2026-11-09T13:00:24.000Z'))).toBe('closed');
    // the phone is 2 s slow: its 13:00:02 is the server's 13:00:04
    expect(questionPhase(q, 2000, at('2026-11-09T13:00:02.000Z'))).toBe('open');
    expect(questionPhase({ ...q, revealed: true }, 0, at('2026-11-09T13:00:04.000Z'))).toBe('revealed');
    expect(secondsLeft(q.ends_at, 0, at('2026-11-09T13:00:13.000Z'))).toBe(10);
  });

  test('the clock offset is the server time less the round-trip midpoint', () => {
    expect(clockOffset('2026-11-09T13:00:10.000Z', Date.parse('2026-11-09T13:00:00.000Z'), Date.parse('2026-11-09T13:00:01.000Z'))).toBe(9500);
  });

  test('an answer is kept on the phone until the server confirms it', async () => {
    const s = memStore();
    const offline = await sendAnswer(s, () => Promise.reject(new Error('net')), 'q1', 2);
    expect(offline).toEqual({ accepted: false, offline: true });
    expect(loadPending(s)).toEqual({ questionId: 'q1', choice: 2 });
    const ok = await sendAnswer(s, async () => ({ accepted: true, choice: 2 }), 'q1', 2);
    expect(ok.accepted).toBe(true);
    expect(loadPending(s)).toBeNull();
  });

  test('a refusal that cannot change clears the queue; a server hiccup keeps it', async () => {
    const s = memStore();
    await sendAnswer(s, async () => ({ accepted: false, reason: 'too_late' }), 'q1', 1);
    expect(loadPending(s)).toBeNull();
    await sendAnswer(s, async () => ({ accepted: false, reason: 'something_new' }), 'q2', 1);
    expect(loadPending(s)).toEqual({ questionId: 'q2', choice: 1 });
  });

  test('the saved player belongs to one game only', () => {
    const s = memStore();
    savePlayer(s, { gameId: 'g1', token: 't', nickname: 'Ada' });
    expect(loadPlayer(s, 'g1')?.token).toBe('t');
    expect(loadPlayer(s, 'g2')).toBeNull();
  });
});

describe('days, title and prizes', () => {
  test('the challenge days are 9, 10 and 11 November in Lagos time', () => {
    expect(dayForDate(new Date('2026-11-09T13:00:00Z'))).toBe(1);
    expect(dayForDate(new Date('2026-11-10T23:30:00Z'))).toBe(3); // 00:30 on the 11th in Lagos
    expect(dayForDate(new Date('2026-11-12T10:00:00Z'))).toBeNull();
  });
  test('owner wording: title, day themes, certificate line and three prizes', () => {
    expect(QUIZ_TITLE).toBe('Petrolord Upstream Challenge');
    expect(DAYS[3].label).toBe('Day 3: Reservoir Modelling and Field Development');
    expect(certificateTitle(1, 1)).toBe('Winner, Day 1: Exploration (1st place)');
    expect(PRIZES[1]).toMatch(/two months/i);
    expect(PRIZES[2]).toMatch(/Petrophysics/);
    expect(PRIZES[3]).toMatch(/50%/);
  });
});
