// The NAPE booth quiz (2026-11): the Petrolord Upstream Challenge. One game a
// day at 2pm on 9, 10 and 11 November, each day on its own theme. Players join
// on their phones with a nickname and phone number, a member of staff runs the
// round from the host page, and the booth TV shows the live question and the
// leaderboard. Pure helpers live here: the scoring rule (the database applies
// the same one in event_quiz_points), the question draw, the ranking with
// tie-breakers, the podium, and the small bits of phone state that let a
// player survive a dropped connection.
import { normalisePhone, CONSENT_TEXT } from '@/lib/eventLeads';

export const QUIZ_TITLE = 'Petrolord Upstream Challenge';
export const QUIZ_PATH = '/nape/quiz';
export const QUIZ_TV_PATH = '/nape/quiz/tv';
export const QUIZ_HOST_PATH = '/nape/quiz/host';
export const QUIZ_PUBLIC_URL = 'https://petrolord.com/nape/quiz';
export const QUIZ_QR_SRC = '/event/nape-quiz-qr.svg';
export const QUIZ_START = '2pm';
// Public video URLs for the TV loop between rounds. Empty for now: the demo
// masters sit in a private bucket, so the TV plays the NAPE cuts from files
// chosen on the booth laptop. Add URLs here once the videos have a public home.
export const TV_VIDEO_URLS = Object.freeze([]);
export { CONSENT_TEXT };

export const DAYS = Object.freeze({
  1: { date: '2026-11-09', theme: 'Exploration', label: 'Day 1: Exploration' },
  2: { date: '2026-11-10', theme: 'Production', label: 'Day 2: Production' },
  3: { date: '2026-11-11', theme: 'Reservoir Modelling and Field Development', label: 'Day 3: Reservoir Modelling and Field Development' },
});

// Prizes (owner decision 2026-10-10). Staff hand these over by hand; the app
// only shows them.
export const PRIZES = Object.freeze({
  1: 'Two months of one Petrolord app of your choice from today\'s theme (one seat, to be started within 90 days), plus a certificate of achievement.',
  2: 'A sponsored NextGen Petrophysics course at Associate level, with Professional also sponsored if you pass Associate within 60 days, plus a certificate of achievement.',
  3: 'A certificate of achievement and a 50% discount code for any NextGen Associate course.',
});

export const placeLabel = (place) => ({ 1: '1st', 2: '2nd', 3: '3rd' }[place] || `${place}th`);

/** The certificate line, for example "Winner, Day 1: Exploration (1st place)". */
export function certificateTitle(dayNo, place) {
  const d = DAYS[dayNo];
  return d ? `Winner, ${d.label} (${placeLabel(place)} place)` : `Winner (${placeLabel(place)} place)`;
}

/** Which challenge day a date falls on, in Lagos time; null on other days. */
export function dayForDate(date = new Date()) {
  const lagos = new Date(date.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10); // WAT is UTC+1, no DST
  const hit = Object.entries(DAYS).find(([, d]) => d.date === lagos);
  return hit ? Number(hit[0]) : null;
}

// ---- scoring --------------------------------------------------------------

export const SCORE = Object.freeze({ base: 500, speed: 500 });

/**
 * Points for one answer, the same rule as the database's event_quiz_points:
 * nothing for a wrong answer; a correct one earns 500 plus up to 500 more for
 * speed, falling linearly to 500 at the buzzer. elapsedMs is measured by the
 * server from the moment the question opened to the moment the answer arrived.
 */
export function scoreAnswer(correct, elapsedMs, durationMs) {
  if (!correct) return 0;
  const frac = Math.min(1, Math.max(0, elapsedMs / Math.max(durationMs, 1)));
  return SCORE.base + Math.round(SCORE.speed * (1 - frac));
}

// ---- the draw -------------------------------------------------------------

/** A small seeded generator (mulberry32), so a draw can be repeated in tests. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shuffle = (xs, rng) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Twelve questions a game, warming up from easy to hard.
export const DEFAULT_MIX = Object.freeze({ 1: 2, 2: 3, 3: 3, 4: 2, 5: 2 });

/**
 * Draw a game's main questions from one day's bank. Takes `mix[d]` questions
 * of each difficulty d, spread across modules (round robin over the modules,
 * each shuffled), skips questions marked used (already asked in a real game)
 * and anything in `exclude`, and fills a short difficulty from its nearest
 * neighbours. Returns the questions ordered from easy to hard.
 */
export function drawQuestions(bank, { mix = DEFAULT_MIX, rng = Math.random, exclude = [] } = {}) {
  const skip = new Set(exclude);
  let pool = bank.filter((q) => (q.kind || 'main') === 'main' && !q.used && !skip.has(q.id) && q.active !== false);
  const take = (cands, n) => {
    const byModule = new Map();
    for (const q of shuffle(cands, rng)) {
      if (!byModule.has(q.module)) byModule.set(q.module, []);
      byModule.get(q.module).push(q);
    }
    const lanes = shuffle([...byModule.values()], rng);
    const out = [];
    while (out.length < n && lanes.some((l) => l.length)) {
      for (const lane of lanes) if (lane.length && out.length < n) out.push(lane.shift());
    }
    return out;
  };
  const picked = [];
  const want = Object.entries(mix).map(([d, n]) => [Number(d), Number(n)]).sort((x, y) => x[0] - y[0]);
  const short = [];
  for (const [d, n] of want) {
    const got = take(pool.filter((q) => q.difficulty === d), n);
    picked.push(...got);
    const ids = new Set(got.map((q) => q.id));
    pool = pool.filter((q) => !ids.has(q.id));
    if (got.length < n) short.push([d, n - got.length]);
  }
  for (const [d, n] of short) {
    for (let k = 0; k < n && pool.length; k += 1) {
      const best = [...pool].sort((x, y) => Math.abs(x.difficulty - d) - Math.abs(y.difficulty - d) || rng() - 0.5)[0];
      picked.push(best);
      pool = pool.filter((q) => q.id !== best.id);
    }
  }
  // easy to hard; within a difficulty, keep the module spread from the draw
  return picked
    .map((q, i) => ({ q, i }))
    .sort((x, y) => x.q.difficulty - y.q.difficulty || x.i - y.i)
    .map((x) => x.q);
}

/**
 * The next tie-breaker question: never one already asked today, and harder
 * than `after`, the hardest tie-breaker these same players have already
 * played (0 for a fresh tie). Takes the easiest question above that level;
 * failing that, one at the same level; failing that, the hardest left. Null
 * when the pool is empty.
 */
export function nextTiebreak(bank, askedIds = [], { after = 0, rng = Math.random } = {}) {
  const asked = new Set(askedIds);
  const left = shuffle(bank.filter((q) => q.kind === 'tiebreak' && !asked.has(q.id) && !q.used && q.active !== false), rng)
    .sort((x, y) => x.difficulty - y.difficulty);
  if (!left.length) return null;
  return left.find((q) => q.difficulty > after) || left.find((q) => q.difficulty >= after) || left[left.length - 1];
}

/** The hardest tie-breaker that every one of these players has already played. */
export function lastTiebreakLevel(tiebreaks, playerIds) {
  return tiebreaks
    .filter((t) => playerIds.every((id) => (t.eligible || []).includes(id)))
    .reduce((m, t) => Math.max(m, t.difficulty || 0), 0);
}

// ---- ranking, ties and the podium ----------------------------------------

/**
 * Compare two players: main-round points first; then, in the order they
 * were played, every revealed tie-breaker both players were part of (higher
 * points in it wins; no answer or a wrong answer is 0). 0 means still tied.
 * players: [{id, points}]; tiebreaks: [{seq, eligible: [id], points: {id: n}, revealed}]
 */
export function makeComparator(tiebreaks = []) {
  const rounds = tiebreaks.filter((t) => t.revealed).sort((a, b) => a.seq - b.seq);
  return (a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    for (const r of rounds) {
      const el = r.eligible || [];
      if (el.includes(a.id) && el.includes(b.id)) {
        const d = (r.points?.[b.id] || 0) - (r.points?.[a.id] || 0);
        if (d) return d;
      }
    }
    return 0;
  };
}

/**
 * Players in finishing order, each with `rank` (players still tied share a
 * rank, as in 1, 2, 2, 4). Kicked players are left out; the tie order is by
 * nickname only so the list is stable on screen.
 */
export function rankPlayers(players, tiebreaks = []) {
  const cmp = makeComparator(tiebreaks);
  const list = players
    .filter((p) => !p.kicked)
    .slice()
    .sort((a, b) => cmp(a, b) || String(a.nickname || '').localeCompare(String(b.nickname || '')));
  return list.map((p, i) => {
    let r = i;
    while (r > 0 && cmp(list[r - 1], p) === 0) r -= 1;
    return { ...p, rank: r + 1 };
  });
}

/**
 * The podium from ranked players: up to `places` winners, taken in order, and
 * only from players who scored (points > 0). Every group of players still
 * tied that touches a podium place is returned in `ties`, in finishing order,
 * and the podium is not final until each one is broken. A tie wholly below
 * the podium does not matter.
 */
export function podium(ranked, places = 3, tiebreaks = []) {
  const cmp = makeComparator(tiebreaks);
  const scorers = ranked.filter((p) => p.points > 0);
  const ties = [];
  let pos = 0;
  while (pos < scorers.length && pos < places) {
    let end = pos + 1;
    while (end < scorers.length && cmp(scorers[pos], scorers[end]) === 0) end += 1;
    if (end - pos > 1) ties.push({ from: pos + 1, players: scorers.slice(pos, end) });
    pos = end;
  }
  return {
    winners: scorers.slice(0, places),
    ties,
    final: ties.length === 0,
  };
}

// ---- joining and the phone ------------------------------------------------

export const NICK_MIN = 2;
export const NICK_MAX = 20;

export const cleanNickname = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Field problems as {field: message}; empty when the player can join. */
export function validateJoin(f) {
  const e = {};
  const nick = cleanNickname(f.nickname);
  if (nick.length < NICK_MIN) e.nickname = 'Please choose a nickname of at least 2 characters.';
  else if (nick.length > NICK_MAX) e.nickname = 'Please keep your nickname to 20 characters.';
  if (!normalisePhone(f.phone)) e.phone = 'Please give a phone number we can reach, for example 0803 123 4567.';
  if (!f.consent) e.consent = 'Please tick the box to play.';
  return e;
}

/** What the join function's refusal reasons mean to a player. */
export const JOIN_MESSAGES = Object.freeze({
  not_open: 'The challenge is not open for joining right now. It starts at 2pm at the Petrolord booth.',
  nickname: 'Please choose a nickname of 2 to 20 characters.',
  phone: 'Please check your phone number.',
  consent: 'Please tick the box to play.',
  nickname_taken: 'Someone already has that nickname. Please choose another.',
  phone_taken: 'That phone number has already joined with a different nickname. Use the same nickname to carry on, or ask a member of staff.',
  removed: 'This player was removed by the host. Please speak to a member of staff.',
  full: 'This game is full.',
});

/** How far the server clock is ahead of this device, in ms. */
export function clockOffset(serverNowIso, sentAtMs, receivedAtMs) {
  const server = Date.parse(serverNowIso);
  if (!Number.isFinite(server)) return 0;
  return server - (sentAtMs + receivedAtMs) / 2;
}

/** Seconds left on a question by the server clock (never below 0). */
export function secondsLeft(endsAtIso, offsetMs, nowMs = Date.now()) {
  const end = Date.parse(endsAtIso);
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, (end - (nowMs + offsetMs)) / 1000);
}

/**
 * The phase of the current question on this device's corrected clock:
 * 'ready' before it opens, 'open' while answers count, 'closed' after the
 * buzzer and 'revealed' once the host shows the answer.
 */
export function questionPhase(q, offsetMs, nowMs = Date.now()) {
  if (!q) return null;
  if (q.revealed) return 'revealed';
  const now = nowMs + offsetMs;
  if (now < Date.parse(q.starts_at)) return 'ready';
  if (now < Date.parse(q.ends_at)) return 'open';
  return 'closed';
}

const PLAYER_KEY = 'pl.quiz.player';
const PENDING_KEY = 'pl.quiz.pending';

const read = (storage, key) => {
  try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
};
const write = (storage, key, v) => {
  try { if (v == null) storage.removeItem(key); else storage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ }
};

/** The player this phone joined as, for one game: {gameId, token, nickname}. */
export const loadPlayer = (storage, gameId) => {
  const p = read(storage, PLAYER_KEY);
  return p && p.gameId === gameId && p.token ? p : null;
};
export const savePlayer = (storage, p) => write(storage, PLAYER_KEY, p);
export const forgetPlayer = (storage) => write(storage, PLAYER_KEY, null);

/** An answer tapped but not yet confirmed by the server: {questionId, choice}. */
export const loadPending = (storage) => read(storage, PENDING_KEY);
export const savePending = (storage, p) => write(storage, PENDING_KEY, p);
export const clearPending = (storage) => write(storage, PENDING_KEY, null);

/**
 * Send an answer, keeping it on the phone until the server answers, so a
 * dropped connection retries the same choice instead of losing it. The
 * server keeps the first answer it receives and reports a repeat as
 * accepted. Returns the server's reply, or {accepted: false, offline: true}.
 */
export async function sendAnswer(storage, send, questionId, choice) {
  savePending(storage, { questionId, choice });
  try {
    const res = await send(questionId, choice);
    if (res && (res.accepted || ['too_late', 'not_eligible', 'unknown_question', 'not_open', 'removed', 'unknown_player'].includes(res.reason))) {
      clearPending(storage);
    }
    return res || { accepted: false, offline: true };
  } catch {
    return { accepted: false, offline: true };
  }
}

export const OPTION_LETTERS = Object.freeze(['A', 'B', 'C', 'D']);
