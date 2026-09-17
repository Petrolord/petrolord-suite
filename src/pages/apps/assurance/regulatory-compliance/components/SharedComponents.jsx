import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_TOKENS, deriveStatus, explainStatus } from '@/lib/complianceStatus';

/**
 * AS3 — the status badge, painted from the one authority.
 *
 * It used to take a `status` string and look it up in a colour map it
 * owned, with four entries and a silent fall-through to grey. A permit
 * whose stored word was anything else — and the word was free text —
 * rendered as "Draft" grey. It now derives the status from the row,
 * so the badge, the tile and the chart slice cannot disagree.
 */
export const StatusBadge = ({ obligation, today, className }) => {
  const status = deriveStatus(obligation, today || new Date());
  const { reason } = explainStatus(obligation, today || new Date());
  const token = STATUS_TOKENS[status];
  return (
    <span
      title={reason}
      className={cn(
        'px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap',
        className,
      )}
      style={{
        backgroundColor: `hsl(var(${token}) / 0.1)`,
        color: `hsl(var(${token}))`,
        borderColor: `hsl(var(${token}) / 0.25)`,
      }}
    >
      {status}
    </span>
  );
};

export const EmptyState = ({ title, description, icon, action }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-[hsl(var(--border))] rounded-xl bg-[hsl(var(--card))]/50">
    <div className="text-[hsl(var(--muted-foreground))] mb-4 opacity-50">{icon}</div>
    <h3 className="text-lg font-medium text-[hsl(var(--foreground))] mb-1">{title}</h3>
    <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-sm">{description}</p>
    {action ? <div className="mt-5">{action}</div> : null}
  </div>
);

/**
 * A failed query is not an empty register. The old app set its rows to
 * [] on an error and rendered "No obligations found matching your
 * criteria", so a broken database and a clean bill of health looked
 * exactly the same.
 */
export const ErrorState = ({ error, onRetry }) => (
  <div className="m-6 p-5 rounded-xl border border-[hsl(var(--destructive))]/30 bg-[hsl(var(--destructive))]/5">
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-[hsl(var(--destructive))] shrink-0 mt-0.5" />
      <div className="flex-1">
        <h3 className="font-medium text-[hsl(var(--foreground))]">
          The compliance register could not be loaded
        </h3>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{error}</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">
          Nothing is shown below, because showing an empty register here would
          look like an organization with no obligations.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 text-sm font-medium text-[hsl(var(--destructive))] hover:underline"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  </div>
);

export const Loading = ({ label = 'Loading...' }) => (
  <div className="flex flex-col items-center justify-center h-full w-full opacity-50 py-24">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[hsl(var(--warning))] mb-4" />
    <p className="text-[hsl(var(--muted-foreground))]">{label}</p>
  </div>
);

/** A label/value pair for the detail page. */
export const DetailField = ({ label, children }) => (
  <div>
    <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{label}</p>
    <div className="text-sm text-[hsl(var(--foreground))] mt-1">
      {children === null || children === undefined || children === '' ? (
        <span className="text-[hsl(var(--muted-foreground))]">Not set</span>
      ) : children}
    </div>
  </div>
);

export const OwnerAvatar = ({ name }) => {
  const initials = name ? name.split(' ').map((n) => n[0]).join('').substring(0, 2) : '?';
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))] flex items-center justify-center text-[10px] font-bold border border-[hsl(var(--warning))]/30">
        {initials}
      </div>
      <span className="text-sm text-[hsl(var(--foreground))]">{name}</span>
    </div>
  );
};

/**
 * Shown while migration 20260917100000 is unapplied. The app works
 * without it, on fewer columns; saying so is better than a user
 * wondering where the regime field went.
 */
export const SchemaNotice = () => (
  <div className="mx-6 mt-4 p-3 rounded-lg border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 text-sm text-[hsl(var(--muted-foreground))]">
    This database does not have the AS3 compliance schema yet, so regime,
    expiry dates, evidence and obligation codes are unavailable. Everything
    else works. Ask your administrator to apply migration 20260917100000.
  </div>
);
