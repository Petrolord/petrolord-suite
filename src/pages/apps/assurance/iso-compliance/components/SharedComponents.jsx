import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * AS8 — the states the old app could not tell apart.
 *
 * It could not tell them apart because it never asked. No page in ISO
 * Compliance issued a query: the clause register, the audit
 * programme, the findings and the actions were all generated in
 * src/data/isoComplianceData.js at module load, so a broken database,
 * an organization with no management system and a fully certified one
 * all rendered the same thirty invented clauses — with different
 * numbers each time, because the generator used Math.random().
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
        <h3 className="font-medium">The ISO register could not be loaded</h3>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{error}</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">
          Nothing is shown below. This app used to show thirty invented clauses,
          fifteen invented audits and a compliance percentage to every
          organization, whatever was in its register and whether or not the
          database answered at all.
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
 * src/lib/isoCompliance.js and says which condition is unmet.
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

/**
 * The readiness panel: named work, never a percentage.
 *
 * What it replaces is the dashboard tile "Overall Compliance 73%",
 * computed as the share of clauses whose own owners had marked them
 * compliant, over generated data.
 */
export const BlockerList = ({ readiness, emptyLabel = 'Nothing is blocking a certification audit of this standard.' }) => {
  if (!readiness) return null;
  if (!readiness.blockers.length) {
    return <p className="text-sm text-[hsl(var(--muted-foreground))]">{emptyLabel}</p>;
  }
  const token = (severity) => (
    severity === 'blocking' ? '--destructive' : severity === 'serious' ? '--warning' : '--muted-foreground'
  );
  return (
    <ul className="space-y-2">
      {readiness.blockers.map((b) => (
        <li key={b.text} className="flex items-start gap-3 text-sm">
          <span
            className="mt-1.5 w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: `hsl(var(${token(b.severity)}))` }}
          />
          <span>
            {b.text}
            {b.severity === 'blocking' ? (
              <span className="ml-2 text-xs uppercase tracking-wide text-[hsl(var(--destructive))]">
                blocking
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
};

/** Shown while migration 20260917600000 is unapplied. */
export const SchemaNotice = () => (
  <div className="mb-4 p-4 rounded-xl border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 text-sm">
    <p className="font-medium">This database has no ISO compliance schema yet.</p>
    <p className="text-[hsl(var(--muted-foreground))] mt-1">
      Standards, clauses, internal audits, findings and corrective actions cannot
      be stored until migration 20260917600000 is applied. Ask your administrator
      to apply it. Nothing is shown in the meantime: this app used to display
      thirty invented clauses instead, and a different compliance percentage on
      every reload.
    </p>
  </div>
);
