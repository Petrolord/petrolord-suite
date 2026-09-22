// The shared "Full precision" switch (W3, D3). One provider per app page, one
// toggle in its header, and panels read the state with useFullPrecision().
// Outside a provider the state is always OFF, so a panel wired for full
// precision prints exactly as before wherever it is reused.
import React, { createContext, useContext, useMemo, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  formatFull, formatMoneyMM, pickPrecision, FULL_PRECISION_DECIMALS, MONEY_MM_DECIMALS,
} from '@/lib/fullPrecision';

const FullPrecisionContext = createContext(null);

export function FullPrecisionProvider({ children, initial = false }) {
  const [full, setFull] = useState(Boolean(initial));
  const value = useMemo(() => ({ full, setFull, inProvider: true }), [full]);
  return <FullPrecisionContext.Provider value={value}>{children}</FullPrecisionContext.Provider>;
}

const OFF = { full: false, setFull: () => {}, inProvider: false };

export function useFullPrecision() {
  const ctx = useContext(FullPrecisionContext) || OFF;
  const { full } = ctx;
  return useMemo(() => ({
    full,
    setFull: ctx.setFull,
    inProvider: ctx.inProvider,
    // show(normal, value, decimals): the old text when off, the value at
    // `decimals` (default 6) when on
    show: (normal, value, decimals = FULL_PRECISION_DECIMALS) => pickPrecision(full, normal, value, decimals),
    // showMM(normal, usd, decimals): money held in USD, in $MM at 4 dp when on
    showMM: (normal, usd, decimals = MONEY_MM_DECIMALS) => (full ? formatMoneyMM(usd, decimals) : normal),
    // showMMValue(normal, mm, decimals): money already held in $MM
    showMMValue: (normal, mm, decimals = MONEY_MM_DECIMALS) => (full ? formatFull(mm, decimals) : normal),
  }), [full, ctx.setFull, ctx.inProvider]);
}

// The switch itself. `app` names the app for the page's own markers; the
// label and the note say what changes and nothing else.
export function FullPrecisionToggle({ app, className, tone = 'dark' }) {
  const ctx = useContext(FullPrecisionContext);
  if (!ctx) return null;
  const { full, setFull } = ctx;
  const id = `full-precision-${app || 'app'}`;
  return (
    <div
      className={cn('flex items-center gap-2', className)}
      data-testid="full-precision-toggle"
      data-full-precision-app={app || ''}
    >
      <Switch id={id} checked={full} onCheckedChange={(v) => setFull(Boolean(v))} aria-label="Full precision" />
      <label
        htmlFor={id}
        className={cn('text-xs cursor-pointer select-none', tone === 'light' ? 'text-slate-700' : 'text-slate-300')}
        title="Prints the graded quantities at 6 decimals (money in $MM at 4 decimals), without digit grouping, so a value can be pasted as it is."
      >
        Full precision
      </label>
    </div>
  );
}

// Small inline badge a panel can show while the switch is on, so a screenshot
// says which mode it was taken in.
export function FullPrecisionNote({ className }) {
  const { full } = useFullPrecision();
  if (!full) return null;
  return (
    <p className={cn('text-[11px] text-amber-300', className)} data-testid="full-precision-note">
      Full precision is on: graded values print at 6 decimals, money in $MM at 4.
    </p>
  );
}

export { formatFull, formatMoneyMM };
