import React from 'react';
import { cn } from '@/lib/utils';
import {
  CAPA_STATUS_TOKENS,
  CHECKPOINT_STATUS_TOKENS,
  NCR_STATUS_TOKENS,
  PLAN_STATUS_TOKENS,
  POINT_TYPE_TOKENS,
  SEVERITY_TOKENS,
  isBlockingPoint,
} from '@/lib/qualityAssurance';

/**
 * AS7 — badges painted from the one authority.
 *
 * The old pages painted status inline with nested ternaries, four
 * times over, and each one had its own silent default: Register.jsx
 * coloured anything that was not Active or Closed orange, and
 * NCRRegister.jsx coloured anything that was not High orange too, so a
 * Critical non-conformance would have rendered in the same amber as a
 * Medium one. None of them had ever been asked to paint a value that
 * came out of a database.
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

export const PlanStatusBadge = ({ status }) => (
  <Pill token={PLAN_STATUS_TOKENS[status] || fallback}>{status || 'Unknown'}</Pill>
);

/**
 * The intervention type, with the distinction that matters in the
 * tooltip rather than only in the code.
 */
export const PointTypeBadge = ({ checkpoint, type }) => {
  const t = type || checkpoint?.point_type;
  return (
    <Pill
      small
      token={POINT_TYPE_TOKENS[t] || fallback}
      title={isBlockingPoint({ point_type: t })
        ? 'A hold point stops work until the verifying party attends and signs.'
        : 'Work may proceed if the party does not attend. Only a hold point stops work.'}
    >
      {t || 'Unset'}
    </Pill>
  );
};

export const CheckpointStatusBadge = ({ status }) => (
  <Pill token={CHECKPOINT_STATUS_TOKENS[status] || fallback}>{status || 'Pending'}</Pill>
);

export const SeverityBadge = ({ severity }) => (
  <Pill small token={SEVERITY_TOKENS[severity] || fallback}>{severity || 'Unset'}</Pill>
);

export const NcrStatusBadge = ({ status }) => (
  <Pill token={NCR_STATUS_TOKENS[status] || fallback}>{status || 'Open'}</Pill>
);

export const CapaStatusBadge = ({ status }) => (
  <Pill small token={CAPA_STATUS_TOKENS[status] || fallback}>{status || 'Open'}</Pill>
);

/**
 * Completion, counted from the checkpoints.
 *
 * The register used to draw this bar from a `progress` number somebody
 * typed into a data file. A plan with no inspection points now says so
 * instead of rendering an empty bar at 0%, because it is not 0%
 * complete: it has no ITP.
 */
export const ProgressBar = ({ progress }) => {
  if (!progress || progress.percent === null) {
    return (
      <span className="text-xs text-[hsl(var(--muted-foreground))]">No inspection points</span>
    );
  }
  return (
    <div className="flex items-center gap-2" title={`${progress.resolved} of ${progress.total} inspection points resolved`}>
      <div className="h-2 w-24 bg-[hsl(var(--secondary))] rounded-full overflow-hidden">
        <div
          className="h-full"
          style={{
            width: `${progress.percent}%`,
            backgroundColor: progress.failed
              ? 'hsl(var(--destructive))'
              : 'hsl(var(--primary))',
          }}
        />
      </div>
      <span className="text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap">
        {progress.resolved}/{progress.total}
      </span>
    </div>
  );
};

/**
 * Shown on a plan row only when it says something: how many hold
 * points are still holding. A badge on every row is noise that hides
 * the ones that matter.
 */
export const HoldPointBadge = ({ progress }) => {
  if (!progress || !progress.holdPointsOutstanding) return null;
  return (
    <Pill
      small
      token="--destructive"
      title="A hold point stops work until it is verified. This plan cannot be closed while one is outstanding."
    >
      {progress.holdPointsOutstanding} hold
    </Pill>
  );
};

/** The effectiveness verdict, including the one that means "go again". */
export const EffectivenessBadge = ({ capa }) => {
  if (!capa) return null;
  if (capa.effectiveness_verified === true) {
    return (
      <Pill small token="--success" title={`Verified effective ${capa.effectiveness_checked_at || ''}`}>
        Effective
      </Pill>
    );
  }
  if (capa.effectiveness_verified === false) {
    return (
      <Pill small token="--destructive" title="Checked, and the action did not fix the problem. Raise another one.">
        Not effective
      </Pill>
    );
  }
  if (capa.status === 'Complete') {
    return (
      <Pill small token="--warning" title="Done, and nobody has been back to see whether it worked.">
        Unverified
      </Pill>
    );
  }
  return null;
};
