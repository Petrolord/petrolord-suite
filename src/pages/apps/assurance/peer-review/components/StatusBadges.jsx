import React from 'react';
import { cn } from '@/lib/utils';
import {
  COMMENT_STATUS_TOKENS,
  DECISION_TOKENS,
  PRIORITY_TOKENS,
  SEVERITY_TOKENS,
  STAGE_TOKENS,
} from '@/lib/peerReview';

/**
 * AS5 — badges painted from the one authority.
 *
 * This file held three colour maps of its own: stage, priority and
 * decision, each a switch over a lower-cased string with a silent
 * fall-through to grey. All three columns were free text, so an
 * unrecognised value was not hypothetical, and the priority map had a
 * further oddity — it tested for 'major' and 'minor' alongside the
 * priorities, because comment severity was being passed through the
 * same component as review priority. Two different vocabularies, one
 * colour map, and a grey default for whatever fell through.
 */

const Pill = ({ token, children, className, title, small }) => (
  <span
    title={title}
    className={cn(
      small
        ? 'px-2 py-0.5 rounded text-[11px] font-semibold tracking-wider uppercase border whitespace-nowrap'
        : 'px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap',
      className,
    )}
    style={{
      backgroundColor: `hsl(var(${token}) / 0.1)`,
      color: `hsl(var(${token}))`,
      borderColor: `hsl(var(${token}) / 0.25)`,
    }}
  >
    {children}
  </span>
);

const fallback = '--muted-foreground';

export const StageBadge = ({ stage }) => (
  <Pill token={STAGE_TOKENS[stage] || fallback}>{stage || 'Unknown'}</Pill>
);

export const PriorityBadge = ({ priority }) => (
  <Pill small token={PRIORITY_TOKENS[priority] || fallback}>{priority || 'Unset'}</Pill>
);

export const DecisionBadge = ({ decision }) => (
  <Pill token={DECISION_TOKENS[decision] || fallback}>{decision || 'Pending'}</Pill>
);

/** Comment severity. Its own component, because it is its own vocabulary. */
export const SeverityBadge = ({ severity }) => (
  <Pill small token={SEVERITY_TOKENS[severity] || fallback}>{severity || 'Unset'}</Pill>
);

export const CommentStatusBadge = ({ status }) => (
  <Pill token={COMMENT_STATUS_TOKENS[status] || fallback}>{status || 'Open'}</Pill>
);
