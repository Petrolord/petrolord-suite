import React from 'react';
import { cn } from '@/lib/utils';
import {
  OUTCOME_TOKENS,
  SCOPE_TOKENS,
  STATUS_TOKENS,
  reuseRecord,
} from '@/lib/lessonsLearned';

/**
 * AS9 — badges painted from the one authority.
 *
 * `src/components/lessons-learned/SharedComponents.jsx` held a
 * `ReusabilityBadge` that painted High, Medium or Low from a field
 * typed into a data file. There is no reusability field in the AS9
 * schema and no such badge here: how widely a lesson applies is a
 * scope, and how often it has been reused is a count of rows.
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

export const LessonStatusBadge = ({ status }) => (
  <Pill
    token={STATUS_TOKENS[status] || fallback}
    title={status === 'Embedded'
      ? 'This lesson has changed something: a risk, a change record, a procedure or a course.'
      : undefined}
  >
    {status || 'Draft'}
  </Pill>
);

export const ScopeBadge = ({ scope }) => (
  <Pill small token={SCOPE_TOKENS[scope] || fallback}
    title="How widely this lesson applies. It is a judgement about scope, not a rating.">
    {scope || 'This asset'}
  </Pill>
);

export const OutcomeBadge = ({ outcome }) => (
  <Pill small token={OUTCOME_TOKENS[outcome] || fallback}>{outcome || 'Adopted'}</Pill>
);

/**
 * The reuse record: how many times this lesson has actually changed
 * something, and shown as nothing at all when the answer is none,
 * because that is what the "applied nowhere" badge is for.
 */
export const ReuseBadge = ({ applications = [] }) => {
  const record = reuseRecord(applications);
  if (!record.applied) return null;
  return (
    <Pill small token="--success"
      title={`${record.targets.join(', ')}${record.lastAppliedOn ? `, last on ${record.lastAppliedOn}` : ''}`}>
      Applied {record.applied}x
    </Pill>
  );
};

/**
 * The badge this app exists for: published, and nobody has done
 * anything with it.
 */
export const UnappliedBadge = ({ lesson, applications = [] }) => {
  if (!['Published', 'Embedded'].includes(lesson?.status)) return null;
  const record = reuseRecord(applications);
  if (record.applied) return null;
  return (
    <Pill small token="--destructive"
      title="Published, and it has not been applied to anything. A lesson that changed nothing has not been learned.">
      Applied nowhere
    </Pill>
  );
};
