import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { PublicPage, PublicBrandBar } from '@/components/public/PublicPage';
import { normalisePhone, whatsappUrl } from '@/lib/eventLeads';
import {
  QUIZ_TITLE, QUIZ_START, DAYS, CONSENT_TEXT, JOIN_MESSAGES, PRIZES, OPTION_LETTERS,
  validateJoin, cleanNickname, loadPlayer, savePlayer, forgetPlayer, loadPending, sendAnswer,
  questionPhase, placeLabel, certificateTitle,
} from '@/lib/eventQuiz';
import { quizApi } from '@/services/eventQuizApi';
import useQuizState, { useTicker } from '@/pages/events/quiz/useQuizState';
import { Countdown, OPTION_STYLES, Leaderboard } from '@/pages/events/quiz/QuizParts';
import { cn } from '@/lib/utils';

// The player's phone for the Petrolord Upstream Challenge (NAPE 2026). Scan
// the booth QR, join with a nickname and phone number (the player is saved as
// a lead too), then answer each question as the host opens it. The phone
// keeps its player token and any unconfirmed answer in local storage, so a
// dropped connection or a closed tab carries on where it left off.

const field = 'w-full rounded-lg border border-pl-border bg-pl-surface px-3 py-3 text-base text-pl-text placeholder:text-pl-muted focus:outline-none focus:ring-2 focus:ring-pl-accent';
const label = 'block text-sm font-medium text-pl-text mb-1';
const err = 'mt-1 text-sm text-pl-danger-text';
const card = 'space-y-4 rounded-xl border border-pl-border bg-pl-surface p-5';
const store = () => {
  try { return window.localStorage; } catch { return null; }
};
const NO_STORE = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const storage = () => store() || NO_STORE;

function Schedule() {
  return (
    <ul className="space-y-1 text-sm text-pl-muted" data-testid="quiz-schedule">
      {Object.values(DAYS).map((d) => (
        <li key={d.date}>
          {new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}, {QUIZ_START}: {d.label}
        </li>
      ))}
    </ul>
  );
}

function JoinForm({ onJoined }) {
  const [f, setF] = useState({ nickname: '', phone: '+234 ', consent: false, website: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (f.website) return; // honeypot
    const problems = validateJoin(f);
    setErrors(problems);
    setMessage('');
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      const res = await quizApi.join({
        nickname: cleanNickname(f.nickname),
        phone: normalisePhone(f.phone),
        consentText: CONSENT_TEXT,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      });
      if (res?.ok) onJoined(res, f);
      else setMessage(JOIN_MESSAGES[res?.reason] || 'We could not add you just now. Please try again.');
    } catch {
      setMessage('We could not reach the challenge. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" data-testid="quiz-join-form">
      <div>
        <label className={label} htmlFor="quiz-nickname">Nickname (shown on the leaderboard)</label>
        <input id="quiz-nickname" className={field} autoComplete="nickname" value={f.nickname} onChange={set('nickname')} maxLength={20} />
        {errors.nickname && <p className={err}>{errors.nickname}</p>}
      </div>
      <div>
        <label className={label} htmlFor="quiz-phone">Phone (WhatsApp)</label>
        <input id="quiz-phone" className={field} type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} maxLength={24} />
        {errors.phone && <p className={err}>{errors.phone}</p>}
        <p className="mt-1 text-xs text-pl-muted">Winners are contacted on this number.</p>
      </div>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="quiz-website">Website</label>
        <input id="quiz-website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} />
      </div>
      <label className="flex items-start gap-3 text-sm text-pl-text">
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={f.consent} onChange={set('consent')} data-testid="quiz-consent" />
        <span>{CONSENT_TEXT}</span>
      </label>
      {errors.consent && <p className={err}>{errors.consent}</p>}
      {message && <p className={err} data-testid="quiz-join-message">{message}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-pl-primary px-4 py-4 text-lg font-semibold text-pl-primary-fg disabled:opacity-60" data-testid="quiz-join">
        {busy ? 'Joining' : 'Join the challenge'}
      </button>
      <p className="text-xs text-pl-muted">
        How we handle your details: <a className="underline" href="/legal/privacy-policy">privacy policy</a>.
      </p>
    </form>
  );
}

function QuestionView({ q, me, offset, token, onAnswered }) {
  const phase = questionPhase(q, offset);
  useTicker(phase === 'ready' || phase === 'open', 200);
  const [picked, setPicked] = useState(null);
  const [note, setNote] = useState('');
  const pending = loadPending(storage());
  const choice = me?.choice ?? (pending?.questionId === q.id ? pending.choice : null) ?? picked;

  useEffect(() => { setPicked(null); setNote(''); }, [q.id]);

  // an answer tapped while offline is sent again as soon as we can
  useEffect(() => {
    if (me?.choice != null || !pending || pending.questionId !== q.id || (phase !== 'open' && phase !== 'closed')) return;
    sendAnswer(storage(), (id, c) => quizApi.answer(token, id, c), q.id, pending.choice).then(() => onAnswered());
  }, [q.id, me?.choice, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = async (i) => {
    if (choice != null || phase !== 'open' || !me?.can_answer) return;
    setPicked(i);
    const res = await sendAnswer(storage(), (id, c) => quizApi.answer(token, id, c), q.id, i);
    if (res.offline) setNote('Saved on this phone. It will be sent as soon as the connection is back.');
    else if (!res.accepted) setNote(res.reason === 'too_late' ? 'Too late for this one.' : 'That answer was not accepted.');
    onAnswered();
  };

  const title = q.kind === 'tiebreak' ? 'Tie-breaker' : `Question ${q.number} of ${q.of}`;

  if (phase === 'ready') {
    return (
      <section className={card} data-testid="quiz-ready">
        <p className="text-sm font-semibold uppercase tracking-wider text-pl-accent-text">{title}</p>
        <p className="text-2xl font-semibold text-pl-text">Get ready</p>
        <p className="text-sm text-pl-muted">{q.module}</p>
      </section>
    );
  }

  const watching = !me?.can_answer && phase !== 'revealed' && me?.choice == null;
  return (
    <section className={card} data-testid="quiz-question">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold uppercase tracking-wider text-pl-accent-text">{title}</span>
        <span className="text-pl-muted">{q.module}</span>
      </div>
      <h2 className="text-xl font-semibold text-pl-text">{q.prompt}</h2>
      {phase === 'open' && <Countdown endsAt={q.ends_at} seconds={(Date.parse(q.ends_at) - Date.parse(q.starts_at)) / 1000} offset={offset} />}
      {watching && q.eligible_names && (
        <p className="text-sm text-pl-muted" data-testid="quiz-tiebreak-watch">Tie-breaker between {q.eligible_names.join(', ')}. Watch the TV.</p>
      )}
      <div className="grid grid-cols-1 gap-3">
        {q.options.map((o, i) => {
          const mine = choice === i;
          const right = phase === 'revealed' && q.answer_index === i;
          const dim = (choice != null && !mine && phase !== 'revealed') || (phase === 'revealed' && !right);
          return (
            <button
              key={i}
              type="button"
              onClick={() => tap(i)}
              disabled={choice != null || phase !== 'open' || !me?.can_answer}
              data-testid={`quiz-option-${i}`}
              aria-pressed={mine}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-4 py-4 text-left text-base font-medium transition',
                OPTION_STYLES[i],
                dim && 'opacity-35',
                mine && 'ring-4 ring-pl-text',
                right && 'ring-4 ring-pl-success',
              )}
            >
              <span className="text-lg font-bold">{OPTION_LETTERS[i]}</span>
              <span className="min-w-0 flex-1">{o}</span>
            </button>
          );
        })}
      </div>
      {phase === 'open' && choice != null && <p className="text-sm text-pl-text" data-testid="quiz-locked">Answer locked in: {OPTION_LETTERS[choice]}</p>}
      {phase === 'closed' && <p className="text-sm text-pl-muted">Time is up. The answer is coming.</p>}
      {phase === 'revealed' && (
        <div data-testid="quiz-result" className="space-y-1">
          {me?.result?.correct
            ? <p className="text-lg font-semibold text-pl-success-text">Correct. +{me.result.points} points</p>
            : <p className="text-lg font-semibold text-pl-text">{choice == null ? 'No answer this time.' : 'Not this time.'} The answer is {OPTION_LETTERS[q.answer_index]}.</p>}
          {q.explanation && <p className="text-sm text-pl-muted">{q.explanation}</p>}
        </div>
      )}
      {note && <p className="text-sm text-pl-muted">{note}</p>}
    </section>
  );
}

function Finished({ game, me, winners }) {
  const won = me?.winner;
  if (won) {
    return (
      <section className={cn(card, 'text-center')} data-testid="quiz-winner">
        <p className="text-sm font-semibold uppercase tracking-wider text-pl-accent-text">{certificateTitle(game.day_no, won.place)}</p>
        <p className="text-3xl font-bold text-pl-text">{placeLabel(won.place)} place, {me.nickname}</p>
        <p className="text-sm text-pl-muted">Show this screen to a member of Petrolord staff at the booth.</p>
        <p className="rounded-xl bg-pl-bg py-4 font-mono text-5xl font-bold tracking-[0.3em] pl-[0.3em] text-pl-text" data-testid="quiz-winner-code">{won.code}</p>
        {won.verified && <p className="text-sm font-semibold text-pl-success-text">Checked by staff</p>}
        <p className="text-sm text-pl-text">{PRIZES[won.place]}</p>
      </section>
    );
  }
  return (
    <section className={card} data-testid="quiz-finished">
      <p className="text-xl font-semibold text-pl-text">Thanks for playing{me ? `, ${me.nickname}` : ''}.</p>
      {me && <p className="text-pl-text">You finished {placeLabel(me.rank)} with {me.points} points.</p>}
      {winners?.length > 0 && (
        <ol className="space-y-1 text-pl-text">
          {winners.map((w) => <li key={w.place}>{placeLabel(w.place)}: {w.nickname}</li>)}
        </ol>
      )}
      <a href={whatsappUrl({ name: me?.nickname || '' })} className="flex w-full items-center justify-center rounded-lg bg-pl-success px-4 py-4 text-lg font-semibold text-white">
        Talk to Petrolord on WhatsApp
      </a>
    </section>
  );
}

export default function NapeQuiz() {
  const [player, setPlayer] = useState(null);
  const { state, offset, online, refresh } = useQuizState({ token: player?.token, intervalMs: 2000 });
  const game = state?.game;

  // pick up the player this phone joined as for the open game
  useEffect(() => {
    if (!game?.id) return;
    const saved = loadPlayer(storage(), game.id);
    if (saved && saved.token !== player?.token) setPlayer(saved);
    if (!saved && player) setPlayer(null);
  }, [game?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // a token the server no longer knows (rejoined elsewhere): ask to join again
  useEffect(() => {
    if (player && state?.token_valid === false) { forgetPlayer(storage()); setPlayer(null); }
  }, [state?.token_valid]); // eslint-disable-line react-hooks/exhaustive-deps

  const onJoined = (res) => {
    const p = { gameId: res.game_id, token: res.token, nickname: res.nickname };
    savePlayer(storage(), p);
    setPlayer(p);
    setTimeout(refresh, 0);
  };

  const me = player ? state?.me : null;
  const q = state?.question;
  const heading = useMemo(() => (game ? `${DAYS[game.day_no]?.label || ''}${game.practice ? ' (practice)' : ''}` : ''), [game]);

  let body;
  if (!state) body = <p className="text-pl-muted">Loading the challenge.</p>;
  else if (!game) {
    body = (
      <section className={card} data-testid="quiz-closed">
        <p className="text-lg text-pl-text">The challenge is not running right now.</p>
        <p className="text-sm text-pl-muted">Join us at the Petrolord booth at {QUIZ_START} on each day of NAPE 2026:</p>
        <Schedule />
      </section>
    );
  } else if (game.status === 'finished') body = <Finished game={game} me={me} winners={state.winners} />;
  else if (!me) {
    body = ['lobby', 'live'].includes(game.status)
      ? <JoinForm onJoined={onJoined} />
      : (
        <section className={card}>
          <p className="text-pl-text">The tie-breakers are on. Watch the TV for the winners.</p>
          <Leaderboard rows={state.leaderboard} />
        </section>
      );
  } else if (me.kicked) body = <section className={card}><p className="text-pl-text">{JOIN_MESSAGES.removed}</p></section>;
  else if (!q) {
    body = (
      <section className={card} data-testid="quiz-lobby">
        <p className="text-xl font-semibold text-pl-text">You are in, {me.nickname}.</p>
        <p className="text-pl-muted">Waiting for the host to start. {game.players} {game.players === 1 ? 'player has' : 'players have'} joined.</p>
        <p className="text-sm text-pl-muted">Answer fast: a correct answer scores 500 points, plus up to 500 more for speed.</p>
      </section>
    );
  } else body = <QuestionView q={q} me={me} offset={offset} token={player.token} onAnswered={refresh} />;

  return (
    <PublicPage testId="nape-quiz" header={<PublicBrandBar />} mainClassName="px-4 py-6">
      <Helmet>
        <title>{QUIZ_TITLE}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="mx-auto w-full max-w-md space-y-5">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-pl-accent-text">NAPE 2026{heading ? `, ${heading}` : ''}</p>
          <h1 className="text-2xl font-semibold text-pl-text">{QUIZ_TITLE}</h1>
          {me && (
            <p className="text-sm text-pl-muted" data-testid="quiz-me">
              {me.nickname}: {me.points} points{me.points > 0 ? `, ${placeLabel(me.rank)} of ${me.players}` : ''}
            </p>
          )}
        </header>
        {!online && <p className="rounded-lg bg-pl-warning/15 px-3 py-2 text-sm text-pl-text" data-testid="quiz-offline">Reconnecting. Your answers are kept on this phone.</p>}
        {body}
      </div>
    </PublicPage>
  );
}
