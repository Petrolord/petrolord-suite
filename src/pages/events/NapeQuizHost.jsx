import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { PublicPage, PublicBrandBar } from '@/components/public/PublicPage';
import {
  QUIZ_TITLE, QUIZ_TV_PATH, QUIZ_PATH, DAYS, DEFAULT_MIX, PRIZES,
  dayForDate, drawQuestions, nextTiebreak, lastTiebreakLevel, rankPlayers, podium, placeLabel, secondsLeft, certificateTitle,
} from '@/lib/eventQuiz';
import { hostApi, quizNudger } from '@/services/eventQuizApi';
import { useTicker } from '@/pages/events/quiz/useQuizState';
import { OptionBadge } from '@/pages/events/quiz/QuizParts';
import { cn } from '@/lib/utils';

// The host's tablet for the Petrolord Upstream Challenge. Open the lobby
// (which draws the day's questions), start each question, reveal it, then
// work out the podium, running tie-breakers among tied players only until
// the top three are settled. Staff check each winner's prize code here too.
// Only quiz hosts get in: platform super admins and booth staff a super
// admin has added (event_quiz_hosts); the database checks on every call.

const btn = 'rounded-lg px-4 py-3 text-base font-semibold disabled:opacity-50';
const primary = `${btn} bg-pl-primary text-pl-primary-fg`;
const secondary = `${btn} border border-pl-border text-pl-text`;
const card = 'space-y-3 rounded-xl border border-pl-border bg-pl-surface p-4';
const field = 'rounded-lg border border-pl-border bg-pl-surface px-3 py-2 text-base text-pl-text';

function VerifyPanel({ nudge }) {
  const [code, setCode] = useState('');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const check = async (mark) => {
    setErr('');
    try { setRes(await hostApi.verify(code, mark)); if (mark) nudge(); } catch (e) { setErr(e.message); }
  };
  return (
    <section className={card} data-testid="host-verify">
      <h2 className="text-lg font-semibold text-pl-text">Check a prize code</h2>
      <div className="flex flex-wrap gap-2">
        <input className={cn(field, 'w-40 font-mono uppercase tracking-widest')} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="CODE" data-testid="host-verify-code" />
        <button type="button" className={secondary} onClick={() => check(false)} disabled={code.length !== 6}>Check</button>
      </div>
      {err && <p className="text-sm text-pl-danger-text">{err}</p>}
      {res && !res.found && <p className="text-sm text-pl-danger-text" data-testid="host-verify-result">No winner has that code.</p>}
      {res?.found && (
        <div className="space-y-2 text-pl-text" data-testid="host-verify-result">
          <p className="text-lg font-semibold">{placeLabel(res.place)} place: {res.nickname} (phone ending {res.phone_tail})</p>
          <p className="text-sm text-pl-muted">{certificateTitle(res.day_no, res.place)}{res.practice ? ' (practice game, no prize)' : ''}</p>
          <p className="text-sm">{PRIZES[res.place]}</p>
          {res.verified_at
            ? <p className="text-sm font-semibold text-pl-success-text">Prize handed over {new Date(res.verified_at).toLocaleString('en-GB')}</p>
            : <button type="button" className={primary} onClick={() => check(true)}>Mark the prize as handed over</button>}
        </div>
      )}
    </section>
  );
}

function HostsPanel() {
  const [hosts, setHosts] = useState(null);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const load = useCallback(() => hostApi.hosts().then(setHosts).catch(() => setHosts(null)), []);
  useEffect(() => { load(); }, [load]);
  if (!hosts) return null; // super admins only
  const set = async (e, on) => {
    setMsg('');
    try {
      const r = await hostApi.setHost(e, on);
      if (!r.ok) setMsg('There is no Petrolord account with that email. Ask them to sign up first.');
      setEmail('');
      load();
    } catch (x) { setMsg(x.message); }
  };
  return (
    <section className={card} data-testid="host-hosts">
      <h2 className="text-lg font-semibold text-pl-text">Booth staff who can host</h2>
      <ul className="space-y-1 text-sm text-pl-text">
        {hosts.map((h) => (
          <li key={h.user_id} className="flex items-center justify-between gap-2">
            <span>{h.email}</span>
            <button type="button" className="text-pl-danger-text underline" onClick={() => set(h.email, false)}>Remove</button>
          </li>
        ))}
        {!hosts.length && <li className="text-pl-muted">Only super admins so far.</li>}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input className={cn(field, 'min-w-0 flex-1')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@lordswayenergy.com" />
        <button type="button" className={secondary} onClick={() => set(email, true)} disabled={!email.includes('@')}>Add host</button>
      </div>
      {msg && <p className="text-sm text-pl-danger-text">{msg}</p>}
    </section>
  );
}

function NewGame({ onCreate, busy }) {
  const [day, setDay] = useState(dayForDate() || 1);
  const [practice, setPractice] = useState(!dayForDate());
  const [seconds, setSeconds] = useState(20);
  const [count, setCount] = useState(12);
  return (
    <section className={card} data-testid="host-new-game">
      <h2 className="text-lg font-semibold text-pl-text">Open the lobby</h2>
      <label className="block text-sm text-pl-text">
        Day
        <select className={cn(field, 'mt-1 block w-full')} value={day} onChange={(e) => setDay(Number(e.target.value))} data-testid="host-day">
          {Object.entries(DAYS).map(([n, d]) => <option key={n} value={n}>{d.label} ({d.date})</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-4 text-sm text-pl-text">
        <label className="flex items-center gap-2">Seconds a question
          <input type="number" min={10} max={60} className={cn(field, 'w-20')} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-2">Questions
          <input type="number" min={4} max={30} className={cn(field, 'w-20')} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} data-testid="host-practice" />
          Practice (does not use up the day&apos;s questions)
        </label>
      </div>
      <button type="button" className={primary} disabled={busy} onClick={() => onCreate({ day, practice, seconds, count })} data-testid="host-create">
        Open the lobby and draw the questions
      </button>
    </section>
  );
}

// Scale the default 2/3/3/2/2 mix to the number of questions asked for.
const mixFor = (count) => {
  const base = Object.values(DEFAULT_MIX).reduce((a, b) => a + b, 0);
  const mix = Object.fromEntries(Object.entries(DEFAULT_MIX).map(([d, n]) => [d, Math.floor((n * count) / base)]));
  let left = count - Object.values(mix).reduce((a, b) => a + b, 0);
  for (const d of [3, 2, 4, 1, 5]) { if (left <= 0) break; mix[d] += 1; left -= 1; }
  return mix;
};

export default function NapeQuizHost() {
  const [isHost, setIsHost] = useState(null);
  const [hs, setHs] = useState(null);
  const [offset, setOffset] = useState(0);
  const [bank, setBank] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nudger = useRef(null);
  const game = hs?.game;

  useEffect(() => {
    hostApi.isHost().then((v) => setIsHost(!!v)).catch(() => setIsHost(false));
    nudger.current = quizNudger();
    return () => nudger.current?.close();
  }, []);
  const nudge = () => nudger.current?.nudge();

  const load = useCallback(async () => {
    const sent = Date.now();
    try {
      const s = await hostApi.state(null);
      setHs(s);
      if (s?.server_now) setOffset(Date.parse(s.server_now) - (sent + Date.now()) / 2);
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    if (!isHost) return undefined;
    load();
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [isHost, load]);

  useEffect(() => {
    if (game?.day_no) hostApi.bank(game.day_no).then(setBank).catch(() => setBank([]));
  }, [game?.id, game?.day_no]);

  const act = async (fn) => {
    setBusy(true);
    setError('');
    try { await fn(); nudge(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const questions = hs?.questions || [];
  const main = questions.filter((q) => q.kind === 'main');
  const current = questions.find((q) => game && q.seq === game.current_seq);
  const mainDone = main.length > 0 && main.every((q) => q.revealed_at);
  const tiebreaks = questions.filter((q) => q.kind === 'tiebreak').map((q) => ({ ...q, revealed: !!q.revealed_at }));
  const ranked = useMemo(() => rankPlayers(hs?.players || [], tiebreaks), [hs]); // eslint-disable-line react-hooks/exhaustive-deps
  const pod = useMemo(() => podium(ranked, 3, tiebreaks), [ranked]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = current && current.starts_at && !current.revealed_at;
  useTicker(!!open, 250);

  const create = ({ day, practice, seconds, count }) => act(async () => {
    const b = await hostApi.bank(day);
    setBank(b);
    const id = await hostApi.create({ dayNo: day, title: QUIZ_TITLE, practice, seconds });
    const ids = drawQuestions(practice ? b.map((q) => ({ ...q, used: false })) : b, { mix: mixFor(count) }).map((q) => q.id);
    if (!ids.length) throw new Error('There are no unused questions left for this day.');
    await hostApi.setPlan(id, ids);
  });

  const redraw = () => act(async () => {
    const ids = drawQuestions(game.practice ? bank.map((q) => ({ ...q, used: false })) : bank, { mix: mixFor(main.length || 12) }).map((q) => q.id);
    await hostApi.setPlan(game.id, ids);
  });

  const runTiebreak = (tie, n) => act(async () => {
    const asked = tiebreaks.map((t) => t.question_id);
    const ids = tie.players.map((p) => p.id);
    const q = nextTiebreak(bank, asked, { after: lastTiebreakLevel(tiebreaks, ids) });
    if (!q) throw new Error('The tie-breaker questions have run out. Decide this tie at the booth.');
    await hostApi.tiebreak(game.id, q.id, ids, n);
  });

  if (isHost === null) return <PublicPage header={<PublicBrandBar />} mainClassName="p-6"><p className="text-pl-muted">Checking access.</p></PublicPage>;
  if (!isHost) {
    return (
      <PublicPage testId="nape-quiz-host" header={<PublicBrandBar />} mainClassName="p-6">
        <p className="text-pl-text" data-testid="host-denied">Only quiz hosts can open this page. Ask a super admin to add your account.</p>
      </PublicPage>
    );
  }

  return (
    <PublicPage testId="nape-quiz-host" header={<PublicBrandBar />} mainClassName="px-4 py-6">
      <Helmet>
        <title>{`${QUIZ_TITLE}: host`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-5">
          <header className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-pl-accent-text">Host{game ? `: ${DAYS[game.day_no]?.label}${game.practice ? ' (practice)' : ''}` : ''}</p>
            <h1 className="text-2xl font-semibold text-pl-text">{QUIZ_TITLE}</h1>
            <p className="text-sm text-pl-muted">Players join at {QUIZ_PATH}; the booth TV shows {QUIZ_TV_PATH}.</p>
          </header>
          {error && <p className="rounded-lg bg-pl-danger-bg px-3 py-2 text-sm text-pl-danger-text" data-testid="host-error">{error}</p>}

          {!game && <NewGame onCreate={create} busy={busy} />}

          {game && game.status === 'lobby' && (
            <section className={card} data-testid="host-lobby">
              <p className="text-pl-text">{hs.players.length} players in the lobby. {main.length} questions drawn.</p>
              <ol className="list-decimal space-y-1 pl-6 text-sm text-pl-muted">
                {main.map((q) => <li key={q.id}>[{q.difficulty}] {q.module}: {q.prompt}</li>)}
              </ol>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={primary} disabled={busy || !main.length} onClick={() => act(() => hostApi.next(game.id))} data-testid="host-start">Start question 1</button>
                <button type="button" className={secondary} disabled={busy} onClick={redraw}>Draw different questions</button>
              </div>
            </section>
          )}

          {game && ['live', 'tiebreak'].includes(game.status) && current && (
            <section className={card} data-testid="host-current">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold uppercase tracking-wider text-pl-accent-text">
                  {current.kind === 'tiebreak' ? `Tie-breaker (difficulty ${current.difficulty})` : `Question ${main.findIndex((q) => q.id === current.id) + 1} of ${main.length}`}
                </span>
                <span className="text-pl-muted">{current.answered} answered</span>
              </div>
              <p className="text-lg font-semibold text-pl-text">{current.prompt}</p>
              <ul className="space-y-1">
                {current.options.map((o, i) => (
                  <li key={i} className={cn('flex items-center gap-2 text-pl-text', i === current.answer_index && 'font-semibold')}>
                    <OptionBadge index={i} /> {o} {i === current.answer_index && <span className="text-pl-success-text">(answer)</span>}
                  </li>
                ))}
              </ul>
              {open && <p className="tabular-nums text-pl-muted">{Math.ceil(secondsLeft(current.ends_at, offset))} s left</p>}
              <div className="flex flex-wrap gap-2">
                {open && <button type="button" className={primary} disabled={busy} onClick={() => act(() => hostApi.reveal(game.id))} data-testid="host-reveal">Reveal the answer</button>}
                {!open && !mainDone && game.status === 'live' && (
                  <button type="button" className={primary} disabled={busy} onClick={() => act(() => hostApi.next(game.id))} data-testid="host-next">Next question</button>
                )}
              </div>
            </section>
          )}

          {game && ['live', 'tiebreak'].includes(game.status) && mainDone && !open && (
            <section className={card} data-testid="host-podium">
              <h2 className="text-lg font-semibold text-pl-text">Podium</h2>
              {pod.ties.length > 0 ? (
                <div className="space-y-3">
                  {pod.ties.map((tie, n) => (
                    <div key={tie.players.map((p) => p.id).join()} className="space-y-2">
                      <p className="text-pl-text">
                        Tied from {placeLabel(tie.from)} place on {tie.players[0].points} points: {tie.players.map((p) => p.nickname).join(', ')}.
                      </p>
                      {n === 0 && (
                        <button type="button" className={primary} disabled={busy} onClick={() => runTiebreak(tie, n + 1)} data-testid="host-tiebreak">
                          Run a tie-breaker for these players
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {pod.winners.length
                    ? <ol className="space-y-1 text-pl-text">{pod.winners.map((p, i) => <li key={p.id}>{placeLabel(i + 1)}: {p.nickname} ({p.points} points)</li>)}</ol>
                    : <p className="text-pl-muted">Nobody scored, so there are no winners.</p>}
                  <button type="button" className={primary} disabled={busy} onClick={() => act(() => hostApi.finish(game.id, pod.winners.map((p) => p.id)))} data-testid="host-finish">
                    Confirm the winners and show the podium
                  </button>
                </div>
              )}
            </section>
          )}

          {game && game.status === 'finished' && (
            <section className={card} data-testid="host-finished">
              <h2 className="text-lg font-semibold text-pl-text">Winners</h2>
              <ol className="space-y-1 text-pl-text">
                {hs.winners.map((w) => (
                  <li key={w.place}>{placeLabel(w.place)}: {w.nickname}, code <span className="font-mono">{w.code}</span>{w.verified_at ? ' (prize handed over)' : ''}</li>
                ))}
              </ol>
              <button type="button" className={secondary} disabled={busy} onClick={() => act(() => hostApi.close(game.id))} data-testid="host-close">
                Close the game (the TV goes back to the videos)
              </button>
            </section>
          )}

          {game && (
            <section className={card}>
              <h2 className="text-lg font-semibold text-pl-text">Standings ({ranked.length} players)</h2>
              <ol className="divide-y divide-pl-border text-sm">
                {(hs.players || []).map((p) => {
                  const r = ranked.find((x) => x.id === p.id);
                  return (
                    <li key={p.id} className={cn('flex items-center gap-3 py-1.5', p.kicked && 'opacity-40')}>
                      <span className="w-8 tabular-nums text-pl-muted">{r ? r.rank : '-'}</span>
                      <span className="min-w-0 flex-1 truncate text-pl-text">{p.nickname} <span className="text-pl-muted">({p.phone_tail})</span></span>
                      <span className="tabular-nums text-pl-text">{p.points}</span>
                      <button type="button" className="text-xs text-pl-muted underline" onClick={() => act(() => hostApi.kick(p.id, !p.kicked))}>
                        {p.kicked ? 'Restore' : 'Remove'}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </div>
        <aside className="space-y-5">
          <VerifyPanel nudge={nudge} />
          <HostsPanel />
          {game && game.status !== 'finished' && (
            <button type="button" className={cn(secondary, 'w-full text-pl-danger-text')} disabled={busy} onClick={() => { if (window.confirm('Abandon this game? Players lose their scores and nobody wins.')) act(() => hostApi.close(game.id)); }}>
              Abandon this game
            </button>
          )}
          <p className="text-xs text-pl-muted">Questions left unused today: {bank.filter((q) => q.kind === 'main' && !q.used).length} main, {bank.filter((q) => q.kind === 'tiebreak' && !q.used).length} tie-breakers.</p>
        </aside>
      </div>
    </PublicPage>
  );
}
