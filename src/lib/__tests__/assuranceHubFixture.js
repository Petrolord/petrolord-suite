/**
 * AS11 — one small organization that trips every hub attention rule
 * once, plus rows that must NOT be listed. Shared by the hub logic
 * test and the hub page render test.
 */
export const TODAY = new Date(2026, 8, 18); // 18 Sept 2026, local midnight

export const day = (offset) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* A small org that trips every rule once, and a few rows that must not. */
export const fixture = () => ({
  risk: {
    risks: [
      { id: 'r1', risk_id: 'RSK-0001', title: 'Residual critical', status: 'Open', likelihood: 5, impact: 5 },
      { id: 'r2', risk_id: 'RSK-0002', title: 'Above appetite', status: 'Mitigated', likelihood: 3, impact: 4, target_score: 6 },
      { id: 'r3', risk_id: 'RSK-0003', title: 'Review late', status: 'Under Review', likelihood: 1, impact: 2, next_review_date: day(-4) },
      { id: 'r4', risk_id: 'RSK-0004', title: 'Closed critical', status: 'Closed', likelihood: 5, impact: 5 },
      { id: 'r5', risk_id: 'RSK-0005', title: 'Draft critical', status: 'Draft', likelihood: 5, impact: 5 },
    ],
  },
  regulatory: {
    obligations: [
      { id: 'o1', obligation_code: 'REG-0001', title: 'Flare permit', expiry_date: day(-2) },
      { id: 'o2', obligation_code: 'REG-0002', title: 'Quarterly return', due_date: day(-10) },
      { id: 'o3', obligation_code: 'REG-0003', title: 'Annual report', due_date: day(5) },
      { id: 'o4', obligation_code: 'REG-0004', title: 'Superseded', due_date: day(-99), lifecycle: 'Superseded' },
    ],
  },
  documents: {
    documents: [
      { id: 'd1', document_number: 'OPS-PRO-0001', title: 'Late review', status: 'Published', next_review_date: day(-1) },
      { id: 'd2', document_number: 'OPS-PRO-0002', title: 'Soon', status: 'Published', next_review_date: day(10) },
      { id: 'd3', document_number: 'OPS-PRO-0003', title: 'Draft, date past', status: 'Draft', next_review_date: day(-50) },
    ],
  },
  peerReview: {
    reviews: [
      { id: 'p1', review_code: 'PR-2026-001', title: 'Late review', stage: 'In Review', due_date: day(-3) },
      { id: 'p2', review_code: 'PR-2026-002', title: 'Blocked', stage: 'Verification', due_date: day(20) },
    ],
    comments: [
      { id: 'c1', review_id: 'p2', severity: 'Critical', status: 'Open' },
      { id: 'c2', review_id: 'p2', severity: 'Major', status: 'Responded' },
      { id: 'c3', review_id: 'p2', severity: 'Minor', status: 'Open' },
      { id: 'c4', review_id: 'p1', severity: 'Critical', status: 'Verified' },
    ],
  },
  moc: {
    records: [
      { id: 'm1', moc_code: 'MOC-2026-001', title: 'Bypass', type: 'Temporary', stage: 'Implementation', expiry_date: day(-6) },
      { id: 'm2', moc_code: 'MOC-2026-002', title: 'Jumper', type: 'Emergency', stage: 'Implementation', expiry_date: day(7) },
      { id: 'm3', moc_code: 'MOC-2026-003', title: 'Late', type: 'Permanent', stage: 'Review', target_implementation_date: day(-8) },
      { id: 'm4', moc_code: 'MOC-2026-004', title: 'Not yet in effect', type: 'Temporary', stage: 'Review', expiry_date: day(-30) },
    ],
    actions: [],
  },
  quality: {
    plans: [], checkpoints: [], capas: [],
    ncrs: [
      { id: 'n1', ncr_code: 'NCR-0001', title: 'Weld crack', severity: 'Critical', status: 'Open' },
      { id: 'n2', ncr_code: 'NCR-0002', title: 'Late paint', severity: 'Minor', status: 'Open', due_date: day(-5) },
      { id: 'n3', ncr_code: 'NCR-0003', title: 'Closed critical', severity: 'Critical', status: 'Closed' },
    ],
  },
  iso: {
    standards: [], clauses: [], actions: [], auditClauses: [],
    audits: [
      { id: 'ia1', audit_code: 'IA-0001', title: 'Clause 8 audit', status: 'In progress', planned_end: day(-2) },
    ],
    findings: [
      { id: 'if1', finding_code: 'F-0001', title: 'Major NC', finding_type: 'Major nonconformity', status: 'Open' },
      { id: 'if2', finding_code: 'F-0002', title: 'Voided', finding_type: 'Major nonconformity', status: 'Voided' },
    ],
  },
  lessons: {
    lessons: [
      { id: 'l1', lesson_code: 'LL-0001', title: 'Stale lesson', status: 'Published', review_due: day(-1) },
      { id: 'l2', lesson_code: 'LL-0002', title: 'Draft stale', status: 'Draft', review_due: day(-1) },
    ],
    applications: [],
  },
  audits: {
    programmes: [], templates: [], responses: [], actions: [],
    audits: [
      { id: 'a1', audit_code: 'AUD-0001', title: 'Contractor audit', status: 'Planned', planned_end: day(-1) },
      { id: 'a2', audit_code: 'AUD-0002', title: 'Reported', status: 'Reported', planned_end: day(-40) },
    ],
    findings: [
      { id: 'af1', finding_code: 'AF-0001', title: 'Dropped object', finding_type: 'Major nonconformity', status: 'Open', stop_work: true },
      { id: 'af2', finding_code: 'AF-0002', title: 'Late minor', finding_type: 'Minor nonconformity', status: 'Open', due_date: day(-12) },
    ],
  },
});
