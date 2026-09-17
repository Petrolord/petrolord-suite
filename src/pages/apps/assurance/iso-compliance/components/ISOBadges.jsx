import React from 'react';
import { cn } from '@/lib/utils';
import {
  ACTION_STATUS_TOKENS,
  AUDIT_STATUS_TOKENS,
  CERTIFICATION_TOKENS,
  CLAUSE_STATUS_TOKENS,
  FINDING_STATUS_TOKENS,
  FINDING_TYPE_TOKENS,
  hasEvidenceRecord,
  claimsConformity,
} from '@/lib/isoCompliance';

/**
 * AS8 — badges painted from the one authority.
 *
 * The old pages painted status inline with nested ternaries, five
 * times over, and every one of them ended in an else: FindingsRegister
 * coloured anything that was not Low or Medium red, so a High severity
 * finding and a value the database had never heard of rendered
 * identically. None of them had ever been asked to paint a value that
 * came out of a database, because none of them had ever seen one.
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

export const ClauseStatusBadge = ({ clause, status }) => {
  const s = status || clause?.status;
  return <Pill token={CLAUSE_STATUS_TOKENS[s] || fallback}>{s || 'Not assessed'}</Pill>;
};

export const FindingTypeBadge = ({ type }) => (
  <Pill
    small
    token={FINDING_TYPE_TOKENS[type] || fallback}
    title={type === 'Major nonconformity'
      ? 'A major nonconformity blocks certification and closes only on a root cause and a corrective action verified effective.'
      : undefined}
  >
    {type || 'Unset'}
  </Pill>
);

export const FindingStatusBadge = ({ status }) => (
  <Pill token={FINDING_STATUS_TOKENS[status] || fallback}>{status || 'Open'}</Pill>
);

export const AuditStatusBadge = ({ status }) => (
  <Pill token={AUDIT_STATUS_TOKENS[status] || fallback}>{status || 'Planned'}</Pill>
);

export const ActionStatusBadge = ({ status }) => (
  <Pill small token={ACTION_STATUS_TOKENS[status] || fallback}>{status || 'Open'}</Pill>
);

export const CertificationBadge = ({ standard }) => {
  const s = standard?.certification_status;
  return (
    <Pill
      token={CERTIFICATION_TOKENS[s] || fallback}
      title={standard?.certificate_number
        ? `${standard.certificate_number}, ${standard.certification_body || 'body not recorded'}`
        : undefined}
    >
      {s || 'Not certified'}
    </Pill>
  );
};

/**
 * Shown on a clause only when it says something: this clause is
 * claimed conformant and nothing has been recorded behind the claim.
 * The old register showed an "Evidence: Current" pill on every row,
 * assigned by `i % 5`.
 */
export const EvidenceBadge = ({ clause }) => {
  if (!clause || !claimsConformity(clause)) return null;
  if (hasEvidenceRecord(clause)) {
    return (
      <Pill small token="--success" title={`${clause.evidence_reference} (${clause.assessed_date})`}>
        Evidenced
      </Pill>
    );
  }
  return (
    <Pill small token="--destructive" title="Marked conformant with no evidence reference, assessment date or assessor recorded.">
      No evidence
    </Pill>
  );
};

/** Coverage, from the one calculation. Never a percentage of opinions. */
export const CoverageBadge = ({ row }) => {
  if (!row) return null;
  if (row.covered) {
    return (
      <Pill small token="--success" title={`Last examined ${row.lastExaminedOn}`}>
        Audited {row.lastExaminedOn}
      </Pill>
    );
  }
  if (row.stale) {
    return (
      <Pill small token="--warning" title={`Last examined ${row.lastExaminedOn}, before this certification cycle began`}>
        Before this cycle
      </Pill>
    );
  }
  return (
    <Pill small token="--destructive" title="No internal audit has examined this clause.">
      Never audited
    </Pill>
  );
};

/** The effectiveness verdict, including the one that means "go again". */
export const EffectivenessBadge = ({ action }) => {
  if (!action) return null;
  if (action.effectiveness_verified === true) {
    return (
      <Pill small token="--success" title={`Verified effective ${action.effectiveness_checked_at || ''}`}>
        Effective
      </Pill>
    );
  }
  if (action.effectiveness_verified === false) {
    return (
      <Pill small token="--destructive" title="Checked, and the action did not fix the problem. Raise another one.">
        Not effective
      </Pill>
    );
  }
  if (action.status === 'Complete') {
    return (
      <Pill small token="--warning" title="Done, and nobody has been back to see whether it worked.">
        Unverified
      </Pill>
    );
  }
  return null;
};

/** The readiness verdict for a standard: a state, never a score. */
export const ReadinessBadge = ({ readiness }) => {
  if (!readiness) return null;
  const blocking = readiness.blockers.filter((b) => b.severity === 'blocking').length;
  if (readiness.ready) {
    return <Pill token="--success">Ready for audit</Pill>;
  }
  return (
    <Pill token="--destructive" title="Each blocker is something a certification auditor would raise.">
      {blocking} blocker{blocking === 1 ? '' : 's'}
    </Pill>
  );
};
