/**
 * AS11 — the Assurance hub's one piece of logic.
 *
 * WHAT IT REPLACES. The hub (`src/pages/dashboard/Assurance.jsx`) said
 * "Unified reporting and real-time analytics across Risk, Documents,
 * Peer Reviews, MOC, QA Plans, Regulatory Compliance, ISO Compliance,
 * and Lessons Learned". Three of its nine panels queried anything. The
 * other five were literals: "Active MOCs 12", "Pending Approval 4",
 * "Implemented 28", a pie of 3/4/5/28, "MOC-2026-042 Review",
 * "Subsea Tie-back Installation QA — QAP-2026-012", and so on, shown to
 * every organization as though they were its own. The ninth app, Audit
 * & Findings Manager, was not on the page at all. The three real panels
 * guessed statuses the apps never wrote ('Identified', 'Resolved',
 * 'Pending') and, with no org filter, would have summed every
 * organization's rows for a super admin.
 *
 * WHAT IT DOES INSTEAD. Nothing here decides anything about a record.
 * Every count comes from the owning app's own authority — its
 * `summarise()` and its own overdue, expiry and openness predicates —
 * so the hub cannot disagree with the app it links to. What the hub
 * adds is the one view no single app can give: WHAT NEEDS SOMEONE
 * ACROSS THE WHOLE MODULE, worst first.
 *
 * THERE IS NO ASSURANCE SCORE. Not a percentage, not a traffic light
 * over the module, not a weighted index. AS8 removed an "Overall
 * Compliance 73%" and made certification readiness a list of blockers;
 * a module-wide score would be the same defect at a larger scale. The
 * hub names the items, and a test asserts it returns no score.
 */

import {
  calculateResidualScore,
  countByBand,
  getAppetiteStatus,
  getRiskBand,
  isReviewOverdue as isRiskReviewOverdue,
  APPETITE,
  RISK_LIVE_STATUSES,
} from './riskScoring';
import {
  deriveStatus as deriveObligationStatus,
  summarise as summariseObligations,
  STATUS as OBLIGATION_STATUS,
} from './complianceStatus';
import {
  reviewState as documentReviewState,
  summarise as summariseDocuments,
  REVIEW as DOCUMENT_REVIEW,
} from './documentControl';
import {
  isBlocking as isBlockingComment,
  isOverdue as isPeerReviewOverdue,
  summarise as summarisePeerReviews,
  ACTIVE_STAGES as PEER_ACTIVE_STAGES,
} from './peerReview';
import {
  expiryState as mocExpiryState,
  isOverdue as isMocOverdue,
  summarise as summariseMoc,
  EXPIRY as MOC_EXPIRY,
} from './managementOfChange';
import {
  daysUntil,
  isNcrOpen,
  isNcrOverdue,
  summarise as summariseQuality,
} from './qualityAssurance';
import {
  isAuditOverdue as isIsoAuditOverdue,
  isFindingOpen,
  isFindingOverdue,
  summarise as summariseIso,
} from './isoCompliance';
import {
  isReviewOverdue as isLessonReviewOverdue,
  summarise as summariseLessons,
} from './lessonsLearned';
import {
  isAuditOverdue,
  summarise as summariseAudits,
} from './auditManagement';

/* ------------------------------------------------------------------ */
/* The nine apps                                                      */
/* ------------------------------------------------------------------ */

const APP_ROOT = '/dashboard/apps/assurance';

/**
 * The nine apps, their catalogue ids and every route the hub links to.
 * Held here and nowhere else, so a hub page names no route of its own
 * (the module-hub guard forbids it) and a test can check every one of
 * these against a route that is actually declared.
 */
export const HUB_APPS = Object.freeze([
  {
    key: 'risk', name: 'Risk Register', appId: 'risk-register',
    base: `${APP_ROOT}/risk-register`,
    record: (id) => `${APP_ROOT}/risk-register/${id}`,
  },
  {
    key: 'regulatory', name: 'Regulatory Compliance', appId: 'regulatory-compliance',
    base: `${APP_ROOT}/regulatory-compliance`,
    record: (id) => `${APP_ROOT}/regulatory-compliance/${id}`,
  },
  {
    key: 'documents', name: 'Document Control', appId: 'document-control',
    base: `${APP_ROOT}/document-control`,
    record: (id) => `${APP_ROOT}/document-control/${id}`,
  },
  {
    key: 'peerReview', name: 'Peer Review Manager', appId: 'peer-review-manager',
    base: `${APP_ROOT}/peer-review-manager`,
    record: (id) => `${APP_ROOT}/peer-review-manager/${id}`,
  },
  {
    key: 'moc', name: 'Management of Change', appId: 'management-of-change',
    base: `${APP_ROOT}/management-of-change`,
    record: (id) => `${APP_ROOT}/management-of-change/${id}`,
  },
  {
    key: 'quality', name: 'Quality Assurance Plan & NCR', appId: 'quality-assurance-plan',
    base: `${APP_ROOT}/qa-plan`,
    record: (id) => `${APP_ROOT}/qa-plan/ncr/${id}`,
  },
  {
    key: 'iso', name: 'ISO Compliance', appId: 'iso-compliance-tool',
    base: `${APP_ROOT}/iso-compliance`,
    record: (id) => `${APP_ROOT}/iso-compliance/findings/${id}`,
    audit: (id) => `${APP_ROOT}/iso-compliance/audits/${id}`,
  },
  {
    key: 'lessons', name: 'Lessons Learned', appId: 'lesson-learned-db',
    base: `${APP_ROOT}/lessons-learned`,
    record: (id) => `${APP_ROOT}/lessons-learned/${id}`,
  },
  {
    key: 'audits', name: 'Audit & Findings Manager', appId: 'audit-findings-manager',
    base: `${APP_ROOT}/audit-manager`,
    record: (id) => `${APP_ROOT}/audit-manager/findings/${id}`,
    audit: (id) => `${APP_ROOT}/audit-manager/audits/${id}`,
  },
]);

export const HUB_APP_KEYS = Object.freeze(HUB_APPS.map((a) => a.key));

export const hubApp = (key) => HUB_APPS.find((a) => a.key === key);

/* ------------------------------------------------------------------ */
/* Per-app summaries: the apps' own, verbatim                          */
/* ------------------------------------------------------------------ */

/**
 * The Risk Register is the one app without a `summarise()`, because its
 * dashboard predates the pattern. This is not a second scoring
 * authority: every number is a call into riskScoring.js, which owns the
 * bands, the residual, the appetite and the review rule.
 */
export const summariseRisks = (risks = [], today = new Date()) => {
  const live = risks.filter(isRiskLive);
  return {
    total: risks.length,
    live: live.length,
    byInherentBand: countByBand(live),
    byResidualBand: countByBand(live, { residual: true }),
    aboveAppetite: live.filter((r) => getAppetiteStatus(r) === APPETITE.ABOVE).length,
    appetiteNotSet: live.filter((r) => getAppetiteStatus(r) === APPETITE.NOT_SET).length,
    reviewsOverdue: live.filter((r) => isRiskReviewOverdue(r, today)).length,
  };
};

/** A risk the organization still carries. Closed and Draft do not count. */
export const isRiskLive = (risk = {}) => RISK_LIVE_STATUSES.includes(risk.status);

/**
 * One summary per app, each produced by that app's own authority.
 * `data[key]` is the rows the hub fetched for that app; an app whose
 * schema is not applied yet arrives as `null` and summarises to `null`
 * rather than to a row of zeros, because "none" and "cannot tell" are
 * different answers.
 */
export const summariseModule = (data = {}, today = new Date()) => {
  const has = (k) => data[k] !== null && data[k] !== undefined;
  return {
    risk: has('risk') ? summariseRisks(data.risk.risks, today) : null,
    regulatory: has('regulatory')
      ? summariseObligations(data.regulatory.obligations, today) : null,
    documents: has('documents')
      ? summariseDocuments(data.documents.documents, today) : null,
    peerReview: has('peerReview')
      ? summarisePeerReviews(data.peerReview.reviews, data.peerReview.comments, today) : null,
    moc: has('moc')
      ? summariseMoc(data.moc.records, { actions: data.moc.actions }, today) : null,
    quality: has('quality') ? summariseQuality(data.quality, today) : null,
    iso: has('iso') ? summariseIso(data.iso, today) : null,
    lessons: has('lessons') ? summariseLessons(data.lessons, today) : null,
    audits: has('audits') ? summariseAudits(data.audits, today) : null,
  };
};

/* ------------------------------------------------------------------ */
/* What needs someone: the cross-app attention list                    */
/* ------------------------------------------------------------------ */

/**
 * Three tiers, and the line between them is a decision recorded here
 * rather than a threshold:
 *
 *  - EXPOSED: the organization is exposed today, not merely late. A
 *    temporary change still running past its expiry, a permit or
 *    obligation that has lapsed or gone overdue, a stop-work finding
 *    still open, a critical non-conformance still open, a live risk
 *    whose RESIDUAL position is in the Critical band.
 *  - OVERDUE: a control has missed its own date. Reviews, findings,
 *    NCRs, audits and implementation dates past due, risks above the
 *    appetite their owner set, comments that block a review.
 *  - DUE SOON: inside the owning app's own lead window, so each app's
 *    notion of "soon" is used and none is restated.
 */
export const TIER = Object.freeze({
  EXPOSED: 'Exposed now',
  OVERDUE: 'Overdue',
  DUE_SOON: 'Due soon',
});

export const TIER_ORDER = Object.freeze([TIER.EXPOSED, TIER.OVERDUE, TIER.DUE_SOON]);

export const TIER_TOKENS = Object.freeze({
  [TIER.EXPOSED]: 'bg-red-500/15 text-red-400 border-red-500/30',
  [TIER.OVERDUE]: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  [TIER.DUE_SOON]: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
});

export const TIER_CHART_COLORS = Object.freeze({
  [TIER.EXPOSED]: '#dc2626',
  [TIER.OVERDUE]: '#d97706',
  [TIER.DUE_SOON]: '#0284c7',
});

/** Days late, from a date column; positive is late, null is undated. */
const lateBy = (date, today) => {
  const d = daysUntil(date, today);
  return d === null ? null : -d;
};

const item = (app, tier, reason, row, { code, href, date, today }) => ({
  app,
  appName: hubApp(app).name,
  tier,
  reason,
  id: row.id,
  code: code || null,
  title: row.title || row.name || null,
  href,
  daysLate: date === undefined ? null : lateBy(date, today),
});

const riskItems = ({ risks = [] } = {}, today) => {
  const app = hubApp('risk');
  const out = [];
  risks.filter(isRiskLive).forEach((r) => {
    const opts = { code: r.risk_id, href: app.record(r.id), today };
    if (getRiskBand(calculateResidualScore(r)) === 'Critical') {
      out.push(item('risk', TIER.EXPOSED, 'Residual risk is Critical', r, opts));
    } else if (getAppetiteStatus(r) === APPETITE.ABOVE) {
      out.push(item('risk', TIER.OVERDUE, 'Residual risk above its appetite', r, opts));
    }
    if (isRiskReviewOverdue(r, today)) {
      out.push(item('risk', TIER.OVERDUE, 'Risk review overdue', r,
        { ...opts, date: r.next_review_date }));
    }
  });
  return out;
};

const regulatoryItems = ({ obligations = [] } = {}, today) => {
  const app = hubApp('regulatory');
  const out = [];
  obligations.forEach((o) => {
    const status = deriveObligationStatus(o, today);
    const opts = { code: o.obligation_code, href: app.record(o.id), today };
    const dated = { ...opts, date: o.expiry_date || o.due_date };
    if (status === OBLIGATION_STATUS.EXPIRED) {
      out.push(item('regulatory', TIER.EXPOSED, 'Permit or licence expired', o, dated));
    } else if (status === OBLIGATION_STATUS.OVERDUE) {
      out.push(item('regulatory', TIER.EXPOSED, 'Obligation overdue', o, dated));
    } else if (status === OBLIGATION_STATUS.DUE_SOON) {
      out.push(item('regulatory', TIER.DUE_SOON, 'Obligation due soon', o, dated));
    }
  });
  return out;
};

const documentItems = ({ documents = [] } = {}, today) => {
  const app = hubApp('documents');
  const out = [];
  documents.forEach((d) => {
    const state = documentReviewState(d, today);
    const opts = {
      code: d.document_number, href: app.record(d.id), date: d.next_review_date, today,
    };
    if (state === DOCUMENT_REVIEW.OVERDUE) {
      out.push(item('documents', TIER.OVERDUE, 'Document review overdue', d, opts));
    } else if (state === DOCUMENT_REVIEW.DUE_SOON) {
      out.push(item('documents', TIER.DUE_SOON, 'Document review due soon', d, opts));
    }
  });
  return out;
};

const peerReviewItems = ({ reviews = [], comments = [] } = {}, today) => {
  const app = hubApp('peerReview');
  const out = [];
  const blockingByReview = new Map();
  comments.filter(isBlockingComment).forEach((c) => {
    blockingByReview.set(c.review_id, (blockingByReview.get(c.review_id) || 0) + 1);
  });
  reviews.forEach((r) => {
    const opts = { code: r.review_code, href: app.record(r.id), today };
    if (isPeerReviewOverdue(r, today)) {
      out.push(item('peerReview', TIER.OVERDUE, 'Peer review overdue', r,
        { ...opts, date: r.due_date }));
    }
    const blocking = blockingByReview.get(r.id) || 0;
    if (blocking > 0 && PEER_ACTIVE_STAGES.includes(r.stage)) {
      out.push(item('peerReview', TIER.OVERDUE,
        `${blocking} unresolved Critical or Major comment${blocking === 1 ? '' : 's'}`, r, opts));
    }
  });
  return out;
};

const mocItems = ({ records = [] } = {}, today) => {
  const app = hubApp('moc');
  const out = [];
  records.forEach((m) => {
    const opts = { code: m.moc_code, href: app.record(m.id), today };
    const expiry = mocExpiryState(m, today);
    if (expiry === MOC_EXPIRY.EXPIRED) {
      out.push(item('moc', TIER.EXPOSED, 'Temporary change running past its expiry', m,
        { ...opts, date: m.expiry_date }));
    } else if (expiry === MOC_EXPIRY.EXPIRING) {
      out.push(item('moc', TIER.DUE_SOON, 'Temporary change expiring soon', m,
        { ...opts, date: m.expiry_date }));
    }
    if (isMocOverdue(m, today)) {
      out.push(item('moc', TIER.OVERDUE, 'Change past its target implementation date', m,
        { ...opts, date: m.target_implementation_date }));
    }
  });
  return out;
};

const qualityItems = ({ ncrs = [] } = {}, today) => {
  const app = hubApp('quality');
  const out = [];
  ncrs.filter(isNcrOpen).forEach((n) => {
    const opts = { code: n.ncr_code, href: app.record(n.id), today };
    if (n.severity === 'Critical') {
      out.push(item('quality', TIER.EXPOSED, 'Critical non-conformance open', n,
        { ...opts, date: n.due_date }));
    } else if (isNcrOverdue(n, today)) {
      out.push(item('quality', TIER.OVERDUE, 'Non-conformance overdue', n,
        { ...opts, date: n.due_date }));
    }
  });
  return out;
};

/** ISO and checklist findings share a vocabulary on purpose (AS10). */
const findingItems = (key, findings, today) => {
  const app = hubApp(key);
  const out = [];
  findings.filter(isFindingOpen).forEach((f) => {
    const opts = { code: f.finding_code, href: app.record(f.id), today };
    if (f.stop_work) {
      out.push(item(key, TIER.EXPOSED, 'Stop-work finding open', f, opts));
    } else if (isFindingOverdue(f, today)) {
      out.push(item(key, TIER.OVERDUE, `${f.finding_type || 'Finding'} overdue`, f,
        { ...opts, date: f.due_date }));
    } else if (f.finding_type === 'Major nonconformity') {
      out.push(item(key, TIER.OVERDUE, 'Major nonconformity open', f, opts));
    }
  });
  return out;
};

const isoItems = ({ findings = [], audits = [] } = {}, today) => {
  const app = hubApp('iso');
  const out = findingItems('iso', findings, today);
  audits
    .filter((a) => isIsoAuditOverdue(a, today))
    .forEach((a) => out.push(item('iso', TIER.OVERDUE, 'Internal audit overdue', a,
      { code: a.audit_code, href: app.audit(a.id), date: a.planned_end, today })));
  return out;
};

const lessonItems = ({ lessons = [] } = {}, today) => {
  const app = hubApp('lessons');
  return lessons
    .filter((l) => isLessonReviewOverdue(l, today))
    .map((l) => item('lessons', TIER.OVERDUE, 'Lesson review overdue', l,
      { code: l.lesson_code, href: app.record(l.id), date: l.review_due, today }));
};

const auditItems = ({ findings = [], audits = [] } = {}, today) => {
  const app = hubApp('audits');
  const out = findingItems('audits', findings, today);
  audits.filter((a) => isAuditOverdue(a, today)).forEach((a) => out.push(
    item('audits', TIER.OVERDUE, 'Audit overdue', a,
      { code: a.audit_code, href: app.audit(a.id), date: a.planned_end, today }),
  ));
  return out;
};

const COLLECTORS = Object.freeze({
  risk: riskItems,
  regulatory: regulatoryItems,
  documents: documentItems,
  peerReview: peerReviewItems,
  moc: mocItems,
  quality: qualityItems,
  iso: isoItems,
  lessons: lessonItems,
  audits: auditItems,
});

/**
 * Worst first: by tier, then the longest overdue, then undated items
 * (which cannot be ranked by lateness and so are not ranked above
 * anything that can), then by code so the order is stable.
 */
export const byAttention = (a, b) => {
  const t = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
  if (t !== 0) return t;
  const al = a.daysLate ?? -Infinity;
  const bl = b.daysLate ?? -Infinity;
  if (al !== bl) return bl - al;
  return String(a.code || '').localeCompare(String(b.code || ''));
};

export const attentionItems = (data = {}, today = new Date()) => HUB_APP_KEYS
  .filter((k) => data[k])
  .flatMap((k) => COLLECTORS[k](data[k], today))
  .sort(byAttention);

/** Counts per app per tier, for the one module-wide chart. */
export const attentionByApp = (items = []) => HUB_APPS.map((a) => {
  const row = { key: a.key, name: a.name };
  TIER_ORDER.forEach((t) => {
    row[t] = items.filter((i) => i.app === a.key && i.tier === t).length;
  });
  row.total = TIER_ORDER.reduce((n, t) => n + row[t], 0);
  return row;
});

/** The module headline: counts, never a score. */
export const moduleHeadline = (items = [], availability = {}) => ({
  exposed: items.filter((i) => i.tier === TIER.EXPOSED).length,
  overdue: items.filter((i) => i.tier === TIER.OVERDUE).length,
  dueSoon: items.filter((i) => i.tier === TIER.DUE_SOON).length,
  appsReporting: HUB_APP_KEYS.filter((k) => availability[k] === true).length,
  appsUnavailable: HUB_APP_KEYS.filter((k) => availability[k] !== true).length,
});
