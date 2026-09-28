import React from 'react';
import { cn } from '@/lib/utils';

// Design system KPI tile (theme roles; use it inside a theme scope).
// `status` is optional and is the only thing that adds colour: a small
// marker and the hint text take the status role. Values use the mono face
// with tabular figures so columns of numbers line up.
const STATUS = {
  success: { dot: 'bg-pl-success', text: 'text-pl-success-text', label: 'Good' },
  warning: { dot: 'bg-pl-warning', text: 'text-pl-warning-text', label: 'Warning' },
  danger: { dot: 'bg-pl-danger', text: 'text-pl-danger-text', label: 'Problem' },
  info: { dot: 'bg-pl-info', text: 'text-pl-info-text', label: 'Note' },
};

const StatTile = React.forwardRef(({ label, value, unit, hint, status, className, ...props }, ref) => {
  const s = status ? STATUS[status] : null;
  return (
    <div
      ref={ref}
      className={cn('rounded-lg border border-pl-border bg-pl-surface p-4 shadow-pl-sm', className)}
      {...props}
    >
      <div className="flex items-center gap-2">
        {s && <span className={cn('h-2 w-2 shrink-0 rounded-full', s.dot)} aria-hidden="true" />}
        <p className="text-xs font-medium uppercase tracking-wide text-pl-muted">{label}</p>
      </div>
      <p className="mt-2 font-pl-mono text-2xl font-medium tabular-nums text-pl-text">
        {value}
        {unit && <span className="ml-1 font-pl-sans text-sm font-normal text-pl-muted">{unit}</span>}
      </p>
      {hint && (
        <p className={cn('mt-1 text-xs', s ? s.text : 'text-pl-muted')}>
          {s && <span className="sr-only">{s.label}: </span>}
          {hint}
        </p>
      )}
    </div>
  );
});
StatTile.displayName = 'StatTile';

export { StatTile };
