import React, { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { PublicPage, WORDMARK } from '@/components/public/PublicPage';
import {
  QUIZ_TITLE, QUIZ_START, QUIZ_QR_SRC, QUIZ_PUBLIC_URL, DAYS, TV_VIDEO_URLS, OPTION_LETTERS,
  dayForDate, questionPhase,
} from '@/lib/eventQuiz';
import useQuizState, { useTicker } from '@/pages/events/quiz/useQuizState';
import { Countdown, OPTION_STYLES, Leaderboard, Podium } from '@/pages/events/quiz/QuizParts';
import { cn } from '@/lib/utils';

// The booth TV (a laptop on HDMI) for the Petrolord Upstream Challenge. With
// no game open it loops the demo videos; when the host opens the lobby it
// switches by itself to the join QR code, then to each question, the
// answers and the leaderboard, and finally the podium. Videos come from
// files chosen on the laptop (expo Wi-Fi cannot be trusted to stream 4K) or
// from TV_VIDEO_URLS once the videos have a public home.

// files picked on the laptop survive re-renders and state changes
let chosenVideos = [];

function VideoLoop({ day }) {
  const [list, setList] = useState(() => (chosenVideos.length ? chosenVideos : TV_VIDEO_URLS));
  const [i, setI] = useState(0);
  const pick = (e) => {
    const urls = [...(e.target.files || [])].map((f) => URL.createObjectURL(f));
    if (urls.length) { chosenVideos = urls; setList(urls); setI(0); }
  };
  const src = list.length ? list[i % list.length] : null;
  return (
    <div className="relative h-full w-full bg-black" data-testid="quiz-tv-videos">
      {src
        ? <video key={src} src={src} className="h-full w-full object-contain" autoPlay muted playsInline onEnded={() => setI((n) => n + 1)} onError={() => setI((n) => n + 1)} />
        : (
          <div className="flex h-full w-full items-center justify-center">
            <label className="cursor-pointer rounded-xl border border-white/30 px-8 py-6 text-2xl text-white" data-testid="quiz-tv-choose">
              Choose the demo videos on this laptop
              <input type="file" accept="video/*" multiple className="hidden" onChange={pick} />
            </label>
          </div>
        )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-8 bg-gradient-to-t from-black/90 to-transparent px-12 pb-8 pt-16 text-white">
        <img src={QUIZ_QR_SRC} alt="" className="h-36 w-36 rounded-lg bg-white p-2" />
        <div className="min-w-0 flex-1">
          <p className="text-5xl font-semibold">{QUIZ_TITLE}</p>
          <p className="mt-2 text-3xl text-white/80">
            {day ? `Today at ${QUIZ_START}: ${DAYS[day].label}` : `${QUIZ_START} daily at the Petrolord booth, 9 to 11 November`}
          </p>
        </div>
        {src && (
          <label className="cursor-pointer self-end text-sm text-white/40 hover:text-white/80">
            Change videos
            <input type="file" accept="video/*" multiple className="hidden" onChange={pick} />
          </label>
        )}
      </div>
    </div>
  );
}

function Lobby({ game, state }) {
  return (
    <div className="grid h-full grid-cols-2 gap-16 p-16" data-testid="quiz-tv-lobby">
      <div className="flex flex-col justify-center gap-8">
        <p className="text-3xl font-semibold uppercase tracking-wider text-pl-accent-text">{DAYS[game.day_no]?.label}{game.practice ? ' (practice)' : ''}</p>
        <h1 className="text-7xl font-bold text-pl-text">{QUIZ_TITLE}</h1>
        <p className="text-4xl text-pl-text">Scan to join on your phone</p>
        <p className="text-2xl text-pl-muted">{QUIZ_PUBLIC_URL.replace('https://', '')}</p>
        <p className="text-2xl text-pl-muted">A correct answer scores 500 points, plus up to 500 more for speed. Three winners today.</p>
      </div>
      <div className="flex flex-col items-center justify-center gap-8">
        <img src={QUIZ_QR_SRC} alt="Join the challenge" className="w-[34rem] max-w-full rounded-2xl bg-white p-6" />
        <p className="text-5xl font-semibold text-pl-text" data-testid="quiz-tv-players">{game.players} {game.players === 1 ? 'player' : 'players'}</p>
        <p className="max-h-40 overflow-hidden text-center text-2xl text-pl-muted">{(state.leaderboard || []).map((r) => r.nickname).join('   ')}</p>
      </div>
    </div>
  );
}

function QuestionScreen({ game, state, offset }) {
  const q = state.question;
  const phase = questionPhase(q, offset);
  useTicker(phase === 'ready' || phase === 'open', 200);
  const label = q.kind === 'tiebreak' ? 'Tie-breaker' : `Question ${q.number} of ${q.of}`;
  const total = (q.counts || []).reduce((a, b) => a + b, 0) || 1;

  if (phase === 'ready') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-8" data-testid="quiz-tv-ready">
        <p className="text-4xl font-semibold uppercase tracking-wider text-pl-accent-text">{label}</p>
        <p className="text-8xl font-bold text-pl-text">Get ready</p>
        <p className="text-4xl text-pl-muted">{q.module}</p>
        {q.eligible_names && <p className="text-4xl text-pl-text">{q.eligible_names.join(' v ')}</p>}
      </div>
    );
  }
  return (
    <div className={cn('grid h-full gap-12 p-14', phase === 'revealed' ? 'grid-cols-[1fr_28rem]' : 'grid-cols-1')} data-testid="quiz-tv-question">
      <div className="flex min-w-0 flex-col gap-8">
        <div className="flex items-center justify-between text-3xl">
          <span className="font-semibold uppercase tracking-wider text-pl-accent-text">{label}</span>
          <span className="text-pl-muted">{q.module}{q.eligible_names ? `: ${q.eligible_names.join(' v ')}` : ''}</span>
        </div>
        <h2 className="text-6xl font-semibold leading-tight text-pl-text">{q.prompt}</h2>
        {phase === 'open' && <Countdown big endsAt={q.ends_at} seconds={(Date.parse(q.ends_at) - Date.parse(q.starts_at)) / 1000} offset={offset} />}
        <div className="grid flex-1 grid-cols-2 content-start gap-6">
          {q.options.map((o, i) => {
            const right = phase === 'revealed' && q.answer_index === i;
            return (
              <div
                key={i}
                className={cn('relative flex min-h-[7rem] items-center gap-5 overflow-hidden rounded-2xl px-8 py-6 text-4xl font-medium', OPTION_STYLES[i], phase === 'revealed' && !right && 'opacity-30', right && 'ring-8 ring-pl-success')}
                data-testid={`quiz-tv-option-${i}`}
              >
                <span className="text-5xl font-bold">{OPTION_LETTERS[i]}</span>
                <span className="min-w-0 flex-1">{o}</span>
                {phase === 'revealed' && <span className="tabular-nums text-3xl">{Math.round(((q.counts?.[i] || 0) / total) * 100)}%</span>}
              </div>
            );
          })}
        </div>
        <p className="text-3xl text-pl-muted">
          {phase === 'revealed' && q.explanation ? q.explanation : `${q.answered} of ${game.players} answered`}
        </p>
      </div>
      {phase === 'revealed' && (
        <div className="flex flex-col gap-6 border-l border-pl-border pl-10">
          <p className="text-3xl font-semibold text-pl-text">Leaderboard</p>
          <Leaderboard big rows={state.leaderboard} />
        </div>
      )}
    </div>
  );
}

export default function NapeQuizTv() {
  const { state, offset } = useQuizState({ intervalMs: 1000 });
  const game = state?.game;
  const [day, setDay] = useState(dayForDate());
  const root = useRef(null);
  useEffect(() => { const t = setInterval(() => setDay(dayForDate()), 60000); return () => clearInterval(t); }, []);

  const fullscreen = () => { try { root.current?.requestFullscreen?.(); } catch { /* optional */ } };

  let screen;
  if (!game) screen = <VideoLoop day={day} />;
  else if (game.status === 'finished') {
    screen = (
      <div className="flex h-full flex-col items-center justify-center gap-12 p-16" data-testid="quiz-tv-finished">
        <p className="text-4xl font-semibold uppercase tracking-wider text-pl-accent-text">{DAYS[game.day_no]?.label}{game.practice ? ' (practice)' : ''}</p>
        <h1 className="text-7xl font-bold text-pl-text">{QUIZ_TITLE}: today&apos;s winners</h1>
        {state.winners?.length ? <Podium big winners={state.winners} dayNo={game.day_no} /> : <p className="text-4xl text-pl-muted">No winners today.</p>}
      </div>
    );
  } else if (!state.question) screen = <Lobby game={game} state={state} />;
  else screen = <QuestionScreen game={game} state={state} offset={offset} />;

  return (
    <PublicPage header={null} className="h-screen w-screen overflow-hidden" mainClassName="min-h-0">
      <Helmet>
        <title>{`${QUIZ_TITLE}: TV`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div ref={root} data-pl-theme="dark" className="relative min-h-0 w-full flex-1 bg-pl-bg text-pl-text" data-testid="nape-quiz-tv">
        {screen}
        {game && <img src={WORDMARK} alt="Petrolord Suite" className="absolute bottom-6 right-8 h-8 w-auto opacity-80" />}
        <button type="button" onClick={fullscreen} className="absolute right-3 top-3 rounded px-2 py-1 text-xs text-white/30 hover:text-white/80">Full screen</button>
      </div>
    </PublicPage>
  );
}
