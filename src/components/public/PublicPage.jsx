import React from 'react';
import { Link } from 'react-router-dom';
import { ThemedApp } from '@/design/ThemeProvider';
import { cn } from '@/lib/utils';

// Design system rollout batch 7C: the frame for the public and auth pages
// (sign in, sign up, password pages, invite, payment verification, solutions,
// resources, company and legal pages).
//
// These pages sit between the public homepage (Home.jsx, its own paper and
// ink look) and the app, so they take the light theme (grey panel) with the
// homepage's brand touches: the Petrolord Suite wordmark on an ink header.
// They always render light: the scope is keyed to the anonymous user and has
// no toggle, so a signed-in user who works in dark still sees the public
// pages as the homepage does (coldLoad.jsx paints their loader light too).

export const WORDMARK = '/petrolord-suite-wordmark.png';

/** The ink header strip: a fixed dark scope, like the dashboard rail. */
export function PublicBrandBar({ children, className }) {
  return (
    <header
      data-pl-theme="dark"
      data-testid="public-brand-bar"
      className={cn('sticky top-0 z-40 border-b border-pl-accent/20 bg-pl-surface text-pl-text', className)}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" aria-label="Petrolord Suite home" className="flex min-w-0 items-center rounded-sm">
          <img src={WORDMARK} alt="Petrolord Suite" width="1041" height="108" className="block h-[22px] w-auto max-w-full sm:h-[28px]" />
        </Link>
        {children ? <div className="flex shrink-0 items-center gap-2 sm:gap-4">{children}</div> : null}
      </div>
    </header>
  );
}

/**
 * The themed page frame. `header` replaces the plain brand bar (Solutions and
 * Resources pass their navigation header); `header={null}` drops it.
 */
export function PublicPage({ testId, header, className, mainClassName, children }) {
  return (
    <ThemedApp
      userId={null}
      data-testid={testId}
      className={cn('flex min-h-screen flex-col bg-pl-bg text-pl-text', className)}
    >
      {header === undefined ? <PublicBrandBar /> : header}
      <main className={cn('flex flex-1 flex-col', mainClassName)}>{children}</main>
    </ThemedApp>
  );
}

/**
 * The always-light public scope without the page frame, for a piece of a
 * page that has none of its own: the homepage's Book a Demo dialog (the
 * homepage paints its own paper look in Home.css and opens no scope).
 * `className="contents"` keeps it out of the layout.
 */
export function PublicScope({ className, children, ...rest }) {
  return (
    <ThemedApp userId={null} className={className} {...rest}>
      {children}
    </ThemedApp>
  );
}

// Shared class strings for the auth cards and the legal documents, written
// out literally so Tailwind generates them.
export const AUTH_CARD = 'rounded-2xl border border-pl-border bg-pl-raised p-6 shadow-pl-lg sm:p-8';
export const AUTH_TITLE = 'font-pl-display text-3xl font-semibold leading-tight text-pl-text sm:text-4xl';
export const TEXT_LINK = 'font-medium text-pl-primary-text hover:text-pl-primary-text-hover hover:underline';

export default PublicPage;
