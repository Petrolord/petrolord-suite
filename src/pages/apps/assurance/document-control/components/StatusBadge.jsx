import React from 'react';
import { cn } from '@/lib/utils';
import {
  CONFIDENTIALITY_TOKENS,
  REVIEW,
  STATUS_TOKENS,
  reviewState,
} from '@/lib/documentControl';

/**
 * AS4 — badges painted from the one authority.
 *
 * This file used to hold two colour maps of its own, written as switch
 * statements over lower-cased strings, each falling through silently to
 * grey for any word it did not recognise. Status and confidentiality
 * were both free text, so an unrecognised word was not hypothetical: a
 * document whose status was anything outside the four cases rendered
 * as "Draft" grey whatever it actually said.
 *
 * They also hardcoded #10B981, #F59E0B, #EF4444 and #A0AEC0 rather than
 * using the UI tokens, as did every other file in the app, so the whole
 * thing ignored the user's theme.
 */

const Pill = ({ token, children, className, title }) => (
  <span
    title={title}
    className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap', className)}
    style={{
      backgroundColor: `hsl(var(${token}) / 0.1)`,
      color: `hsl(var(${token}))`,
      borderColor: `hsl(var(${token}) / 0.25)`,
    }}
  >
    {children}
  </span>
);

export const StatusBadge = ({ status }) => (
  <Pill token={STATUS_TOKENS[status] || '--muted-foreground'}>
    {status || 'Unknown'}
  </Pill>
);

export const ConfidentialityBadge = ({ level }) => (
  <span
    className="px-2 py-0.5 rounded text-[11px] font-semibold tracking-wider uppercase border whitespace-nowrap"
    style={{
      backgroundColor: `hsl(var(${CONFIDENTIALITY_TOKENS[level] || '--muted-foreground'}) / 0.1)`,
      color: `hsl(var(${CONFIDENTIALITY_TOKENS[level] || '--muted-foreground'}))`,
      borderColor: `hsl(var(${CONFIDENTIALITY_TOKENS[level] || '--muted-foreground'}) / 0.25)`,
    }}
  >
    {level || 'Unclassified'}
  </span>
);

/**
 * Where a document stands against its review date. Shown only when it
 * says something: a document not in force is not review-due, and a
 * badge reading "Not in force" beside a status badge already saying
 * "Superseded" is noise.
 */
export const ReviewBadge = ({ document, today }) => {
  const state = reviewState(document, today || new Date());
  if (state === REVIEW.NOT_APPLICABLE) return null;
  const token = state === REVIEW.OVERDUE
    ? '--destructive'
    : state === REVIEW.DUE_SOON
      ? '--warning'
      : state === REVIEW.NOT_SCHEDULED
        ? '--muted-foreground'
        : '--success';
  return (
    <Pill
      token={token}
      title={document?.next_review_date
        ? `Next review ${document.next_review_date}`
        : 'This document is in force with no review date set.'}
    >
      {state}
    </Pill>
  );
};
