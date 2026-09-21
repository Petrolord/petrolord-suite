import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * AS10 — the states an app has to be able to tell apart.
 *
 * There is nothing here to replace: both tiles this app comes from
 * were sold with no code behind them, so there was no loading state,
 * no error state and no empty state, because there was no page. These
 * are written to the module's pattern, set at AS3 and kept since: an
 * empty register says it is empty, a failed query says it failed, and
 * neither one invents a row.
 */

export const Loading = ({ label = 'Loading...' }) => (
  <div className="flex flex-col items-center justify-center py-24 opacity-50">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[hsl(var(--primary))] mb-4" />
    <p className="text-[hsl(var(--muted-foreground))]">{label}</p>
  </div>
);

export const ErrorState = ({ error, onRetry }) => (
  <div className="p-5 rounded-xl border border-[hsl(var(--destructive))]/30 bg-[hsl(var(--destructive))]/5">
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-[hsl(var(--destructive))] shrink-0 mt-0.5" />
      <div className="flex-1">
        <h3 className="font-medium">The audit register could not be loaded</h3>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{error}</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">
          Nothing is shown below. Nothing is invented in its place either: an audit
          programme that cannot be read is not an audit programme with no findings.
        </p>
        {onRetry ? (
          <button type="button" onClick={onRetry}
            className="mt-3 text-sm font-medium text-[hsl(var(--destructive))] hover:underline">
            Try again
          </button>
        ) : null}
      </div>
    </div>
  </div>
);

export const EmptyState = ({ title, description, icon, action }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-[hsl(var(--border))] rounded-xl bg-[hsl(var(--card))]/50">
    <div className="text-[hsl(var(--muted-foreground))] mb-4 opacity-50">{icon}</div>
    <h3 className="text-lg font-medium mb-1">{title}</h3>
    <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-sm">{description}</p>
    {action ? <div className="mt-5">{action}</div> : null}
  </div>
);

export const DetailField = ({ label, children, className }) => (
  <div className={className}>
    <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{label}</p>
    <div className="text-sm mt-1 whitespace-pre-wrap">
      {children === null || children === undefined || children === ''
        ? <span className="text-[hsl(var(--muted-foreground))]">Not set</span>
        : children}
    </div>
  </div>
);

/** A metric tile. `value` is always counted; there is no `trend` prop. */
export const MetricTile = ({ label, value, hint, token = '--primary', icon }) => (
  <div className="p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          {label}
        </p>
        <p className="text-2xl font-bold mt-1" style={{ color: `hsl(var(${token}))` }}>
          {value}
        </p>
        {hint ? (
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{hint}</p>
        ) : null}
      </div>
      {icon ? (
        <div className="opacity-40 shrink-0" style={{ color: `hsl(var(${token}))` }}>{icon}</div>
      ) : null}
    </div>
  </div>
);

/**
 * Why an action is refused, shown where the button is rather than in a
 * toast that disappears. Every refusal in this app comes from
 * src/lib/auditManagement.js and names the unmet condition.
 */
export const GateNotice = ({ reason }) => {
  if (!reason) return null;
  return (
    <div className="p-3 rounded-lg border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 text-sm">
      {reason}
    </div>
  );
};

export const WriteFailure = ({ error }) => {
  if (!error) return null;
  return (
    <div className="p-3 rounded-lg border border-[hsl(var(--destructive))]/30 bg-[hsl(var(--destructive))]/5 text-sm">
      <span className="font-medium">Not saved. </span>{error}
    </div>
  );
};

/** Shown while migration 20260917800000 is unapplied. */
export const SchemaNotice = () => (
  <div className="mb-4 p-4 rounded-xl border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 text-sm">
    <p className="font-medium">This database has no audit schema yet.</p>
    <p className="text-[hsl(var(--muted-foreground))] mt-1">
      Audit programmes, checklists, audits, findings and corrective actions cannot
      be stored until migration 20260917800000 is applied. Ask your administrator
      to apply it.
    </p>
  </div>
);
