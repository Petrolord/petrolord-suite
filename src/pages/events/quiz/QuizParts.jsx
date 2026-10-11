import React from 'react';
import { OPTION_LETTERS, DAYS, PRIZES, placeLabel, certificateTitle, secondsLeft } from '@/lib/eventQuiz';
import { cn } from '@/lib/utils';

// Pieces shared by the phone, the TV and the host page.

export const OPTION_STYLES = [
  'bg-sky-700 text-white',
  'bg-amber-500 text-slate-950',
  'bg-emerald-700 text-white',
  'bg-rose-700 text-white',
];

export function OptionBadge({ index, className }) {
  return (
    <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base font-bold', OPTION_STYLES[index], className)}>
      {OPTION_LETTERS[index]}
    </span>
  );
}

/** A countdown bar plus whole seconds, on the server clock. */
export function Countdown({ endsAt, seconds, offset, className, big = false }) {
  const left = secondsLeft(endsAt, offset);
  const frac = seconds ? Math.min(1, left / seconds) : 0;
  return (
    <div className={cn('flex items-center gap-3', className)} data-testid="quiz-countdown">
      <div className={cn('relative flex-1 overflow-hidden rounded-full bg-pl-border', big ? 'h-4' : 'h-2')}>
        <div className={cn('absolute inset-y-0 left-0 rounded-full', left <= 5 ? 'bg-pl-danger' : 'bg-pl-accent')} style={{ width: `${frac * 100}%` }} />
      </div>
      <span className={cn('tabular-nums font-semibold text-pl-text', big ? 'text-5xl w-24 text-right' : 'text-lg w-10 text-right')}>{Math.ceil(left)}</span>
    </div>
  );
}

export function DayLabel({ dayNo, className }) {
  return <span className={className}>{DAYS[dayNo]?.label || ''}</span>;
}

export function PrizeText({ place, className }) {
  return <p className={className}>{PRIZES[place]}</p>;
}

/** The podium for the TV and the host page. */
export function Podium({ winners, dayNo, big = false }) {
  const order = [2, 1, 3].map((p) => winners.find((w) => w.place === p)).filter(Boolean);
  const height = { 1: big ? 'h-64' : 'h-32', 2: big ? 'h-48' : 'h-24', 3: big ? 'h-36' : 'h-16' };
  return (
    <div className="grid w-full grid-cols-3 items-end gap-4" data-testid="quiz-podium">
      {order.map((w) => (
        <div key={w.place} className="flex min-w-0 flex-col items-center gap-2 text-center">
          <span className={cn('break-words font-semibold text-pl-text', big ? 'text-4xl' : 'text-lg')}>{w.nickname}</span>
          <span className={cn('text-pl-muted', big ? 'text-xl' : 'text-xs')}>{certificateTitle(dayNo, w.place)}</span>
          <div className={cn('flex w-full items-start justify-center rounded-t-xl bg-pl-accent/20 pt-3', height[w.place])}>
            <span className={cn('font-bold text-pl-accent-text', big ? 'text-6xl' : 'text-2xl')}>{placeLabel(w.place)}</span>
          </div>
          <p className={cn('text-pl-muted', big ? 'text-lg' : 'text-xs')}>{PRIZES[w.place]}</p>
        </div>
      ))}
    </div>
  );
}

/** Top of the leaderboard (main-round points over revealed questions). */
export function Leaderboard({ rows, big = false, highlight }) {
  if (!rows?.length) return <p className="text-pl-muted">No players yet.</p>;
  return (
    <ol className={cn('w-full divide-y divide-pl-border', big ? 'text-3xl' : 'text-base')} data-testid="quiz-leaderboard">
      {rows.map((r) => (
        <li key={r.nickname} className={cn('flex items-center gap-4 py-2', highlight && r.nickname === highlight && 'font-semibold text-pl-accent-text')}>
          <span className="w-10 tabular-nums text-pl-muted">{rows.findIndex((x) => x.points === r.points) + 1}</span>
          <span className="min-w-0 flex-1 truncate">{r.nickname}</span>
          <span className="tabular-nums">{r.points}</span>
        </li>
      ))}
    </ol>
  );
}
