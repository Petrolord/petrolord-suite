// Shared page chrome for the account and billing pages (design-system
// rollout batch 1E: upgrade, modules, seats, employees, access requests,
// subscriptions, renew, history, usage). Theme roles only, so everything
// here belongs inside a theme scope. Under /dashboard that is the one
// dashboard scope (DashboardLayout, batch 7A); the pages outside it
// (/profile and the super-admin pages) get their own scope from
// AccountScope. Every consumer of this file is in batch 1E.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemedApp } from '@/design/ThemeProvider';
import { useDsTheme } from '@/design/themeContext';
import { ThemeToggle } from '@/components/ui/theme-toggle';

/**
 * The page root. Inside the dashboard scope it is a plain element (one
 * provider for the whole dashboard, no nested scope); outside it (/profile,
 * /admin/*, /super-admin) it opens the page's own theme scope.
 */
export function AccountScope({ testId, className, children }) {
  const outer = useDsTheme();
  if (outer) {
    return (
      <div className={cn('min-h-screen', className)} data-testid={testId}>
        {children}
      </div>
    );
  }
  return (
    <ThemedApp className={cn('min-h-screen', className)} data-testid={testId}>
      {children}
    </ThemedApp>
  );
}

/** Page body: centred, 16px gutter on phones. */
export function AccountPage({ className, width = 'max-w-6xl', children }) {
  return (
    <div className={cn('mx-auto w-full space-y-6 px-4 py-6 sm:px-6 md:py-8', width, className)}>
      {children}
    </div>
  );
}

/**
 * Page header: optional back button, icon tile, eyebrow, title and
 * description, actions and the light/dark toggle. It sits in the page flow
 * (not sticky), so it never hides under the dashboard's phone bar, and the
 * actions wrap under the title at phone width.
 */
export function AccountHeader({
  title, description, eyebrow = 'Account', icon: Icon, backTo, backLabel = 'Back', actions, className,
}) {
  const navigate = useNavigate();
  return (
    <header className={cn('flex flex-col gap-4 md:flex-row md:items-start md:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {backTo && (
          <button
            type="button"
            onClick={() => navigate(backTo)}
            aria-label={backLabel}
            title={backLabel}
            className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-pl-muted transition-colors hover:bg-pl-sunken hover:text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        {Icon && (
          <span className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-pl-primary text-pl-primary-fg">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-pl-accent-text">{eyebrow}</p>
          )}
          <h1 className="text-2xl font-semibold leading-tight text-pl-text sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-pl-muted">{description}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  );
}

/** Status boxes: colour always travels with a word or an icon. */
const TONES = {
  info: 'border-pl-info/40 bg-pl-info-bg text-pl-info-text',
  success: 'border-pl-success/40 bg-pl-success-bg text-pl-success-text',
  warning: 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text',
  danger: 'border-pl-danger/40 bg-pl-danger-bg text-pl-danger-text',
  neutral: 'border-pl-border bg-pl-sunken text-pl-muted',
};
export const accountCallout = (tone = 'info') => `rounded-lg border p-3 text-sm ${TONES[tone] || TONES.info}`;

/** An empty or loading panel. */
export const accountEmpty = 'rounded-lg border border-pl-border bg-pl-surface p-8 text-center text-sm text-pl-muted';

/** A row inside a card (a member, an assignment). */
export const accountRow = 'flex items-center justify-between gap-3 rounded-md border border-pl-border bg-pl-sunken px-3 py-2';
