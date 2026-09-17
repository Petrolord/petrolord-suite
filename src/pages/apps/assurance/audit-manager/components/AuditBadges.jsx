import React from 'react';
import { cn } from '@/lib/utils';
import {
  ACTION_STATUS_TOKENS,
  AUDIT_STATUS_TOKENS,
  CRITICALITY_TOKENS,
  FINDING_STATUS_TOKENS,
  FINDING_TYPE_TOKENS,
  PROGRAMME_STATUS_TOKENS,
  RESULT_TOKENS,
} from '@/lib/auditManagement';

/**
 * AS10 — badges painted from the one authority.
 *
 * The finding and audit tokens are AS8's, imported through
 * `auditManagement`, so an ISO finding and an audit finding of the
 * same type are the same colour in both apps. Two modules painting
 * "Major nonconformity" differently is how a hub ends up looking like
 * two products.
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

export const ProgrammeStatusBadge = ({ status }) => (
  <Pill token={PROGRAMME_STATUS_TOKENS[status] || fallback}>{status || 'Draft'}</Pill>
);

export const AuditStatusBadge = ({ status }) => (
  <Pill token={AUDIT_STATUS_TOKENS[status] || fallback}>{status || 'Planned'}</Pill>
);

export const FindingTypeBadge = ({ type }) => (
  <Pill small token={FINDING_TYPE_TOKENS[type] || fallback}>{type || 'Unset'}</Pill>
);

export const FindingStatusBadge = ({ status }) => (
  <Pill token={FINDING_STATUS_TOKENS[status] || fallback}>{status || 'Open'}</Pill>
);

export const ActionStatusBadge = ({ status }) => (
  <Pill small token={ACTION_STATUS_TOKENS[status] || fallback}>{status || 'Open'}</Pill>
);

export const CriticalityBadge = ({ criticality }) => (
  <Pill
    small
    token={CRITICALITY_TOKENS[criticality] || fallback}
    title={criticality === 'Critical'
      ? 'A critical question answered Nonconformant must raise a finding before the audit can be reported.'
      : undefined}
  >
    {criticality || 'Minor'}
  </Pill>
);

export const ResultBadge = ({ result }) => (
  <Pill small token={RESULT_TOKENS[result] || fallback}>{result || 'Not examined'}</Pill>
);

/**
 * The badge that stops a page being read casually: this finding
 * stopped work.
 */
export const StopWorkBadge = ({ finding }) => {
  if (!finding?.stop_work) return null;
  return (
    <Pill small token="--destructive"
      title="Work was stopped for this finding. Its immediate correction is recorded on the finding itself.">
      Work stopped
    </Pill>
  );
};

/**
 * Checklist completion, counted from the answers. Never a percentage
 * of anything somebody typed, and it says "no checklist" rather than
 * drawing an empty bar at 0% (the AS7 precedent).
 */
export const ChecklistProgressBar = ({ progress }) => {
  if (!progress || progress.percent === null) {
    return <span className="text-xs text-[hsl(var(--muted-foreground))]">No checklist</span>;
  }
  return (
    <div className="flex items-center gap-2"
      title={`${progress.answered} of ${progress.total} items answered`}>
      <div className="h-2 w-24 bg-[hsl(var(--secondary))] rounded-full overflow-hidden">
        <div
          className="h-full"
          style={{
            width: `${progress.percent}%`,
            backgroundColor: progress.nonconformant
              ? 'hsl(var(--destructive))'
              : 'hsl(var(--primary))',
          }}
        />
      </div>
      <span className="text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap">
        {progress.answered}/{progress.total}
      </span>
    </div>
  );
};
