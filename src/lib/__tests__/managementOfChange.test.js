/**
 * AS6 — the Management of Change authority.
 *
 * The approval gate, the action ordering and the temporary-change
 * expiry are the three things the discipline exists for, and none of
 * them existed in the app: every page was a literal and no stage change
 * was ever checked against anything.
 */
import fs from 'fs';
import path from 'path';
import {
  ACTION_TYPES,
  APPROVAL_STATUSES,
  CATEGORIES,
  CHANGE_TYPES,
  EXPIRY,
  EXPIRY_LEAD_DAYS,
  IMPACT_SEVERITIES,
  RISK_LEVELS,
  STAGES,
  STAGE_CHART_COLORS,
  STAGE_TOKENS,
  approvalState,
  byUrgency,
  canAdvance,
  countBy,
  daysUntil,
  expiryState,
  isExpired,
  isOverdue,
  nextStages,
  parseDateOnly,
  summarise,
  toDateOnlyString,
} from '../managementOfChange';

const TODAY = new Date(2026, 8, 17); // 17 September 2026, local midnight

const moc = (over = {}) => ({
  type: 'Permanent',
  stage: 'Review',
  target_implementation_date: '2026-12-31',
  ...over,
});

const approval = (over = {}) => ({ level: 1, status: 'Approved', ...over });
const action = (over = {}) => ({ action_type: 'Pre-implementation', status: 'Open', ...over });

describe('dates', () => {
  it('parses a date-only value at LOCAL midnight, not UTC', () => {
    const d = parseDateOnly('2026-09-17');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 8, 17, 0]);
  });

  it('counts whole calendar days, signed', () => {
    expect(daysUntil('2026-09-17', TODAY)).toBe(0);
    expect(daysUntil('2026-09-10', TODAY)).toBe(-7);
    expect(daysUntil(null, TODAY)).toBeNull();
  });

  it('round-trips a date-only string', () => {
    expect(toDateOnlyString('2026-09-17')).toBe('2026-09-17');
    expect(toDateOnlyString('rubbish')).toBeNull();
  });
});

describe('temporary change expiry', () => {
  const temp = (over = {}) => moc({ type: 'Temporary', stage: 'Implementation', ...over });

  it('is expired the day after the expiry date and not before', () => {
    expect(isExpired(temp({ expiry_date: '2026-09-17' }), TODAY)).toBe(false);
    expect(isExpired(temp({ expiry_date: '2026-09-16' }), TODAY)).toBe(true);
  });

  it('warns inside the lead time', () => {
    expect(EXPIRY_LEAD_DAYS).toBe(14);
    expect(expiryState(temp({ expiry_date: '2026-09-25' }), TODAY)).toBe(EXPIRY.EXPIRING);
    expect(expiryState(temp({ expiry_date: '2026-11-01' }), TODAY)).toBe(EXPIRY.WITHIN);
  });

  it('applies to emergency changes as well as temporary ones', () => {
    expect(isExpired(temp({ type: 'Emergency', expiry_date: '2026-01-01' }), TODAY)).toBe(true);
  });

  it('never applies to a permanent change', () => {
    expect(expiryState(moc({ type: 'Permanent', stage: 'Implementation', expiry_date: '2020-01-01' }), TODAY))
      .toBe(EXPIRY.NOT_APPLICABLE);
    expect(isExpired(moc({ type: 'Permanent', expiry_date: '2020-01-01' }), TODAY)).toBe(false);
  });

  it('only counts a change that is actually on the facility', () => {
    // A temporary change still in Review is not running anywhere, so
    // its expiry date is a plan and not a breach. One that was
    // rejected or cancelled never happened at all.
    ['Draft', 'Screening', 'Review', 'Approval', 'Rejected', 'Cancelled'].forEach((stage) => {
      expect(isExpired(temp({ stage, expiry_date: '2020-01-01' }), TODAY)).toBe(false);
    });
    expect(isExpired(temp({ stage: 'Implementation', expiry_date: '2020-01-01' }), TODAY)).toBe(true);
  });

  it('says so when a live temporary change has no expiry at all', () => {
    expect(expiryState(temp({ expiry_date: null }), TODAY)).toBe(EXPIRY.NONE);
  });
});

describe('overdue implementation', () => {
  it('is overdue the day after the target and not before', () => {
    expect(isOverdue(moc({ target_implementation_date: '2026-09-17' }), TODAY)).toBe(false);
    expect(isOverdue(moc({ target_implementation_date: '2026-09-16' }), TODAY)).toBe(true);
  });

  it('does not chase a change that is finished', () => {
    ['Closed', 'Rejected', 'Cancelled'].forEach((stage) => {
      expect(isOverdue(moc({ stage, target_implementation_date: '2020-01-01' }), TODAY)).toBe(false);
    });
  });
});

describe('the multi-level approval gate', () => {
  it('is complete only when every level has signed', () => {
    const state = approvalState([
      approval({ level: 1, status: 'Approved' }),
      approval({ level: 2, status: 'Pending' }),
    ]);
    expect(state.levels).toEqual([1, 2]);
    expect(state.outstanding).toEqual([2]);
    expect(state.complete).toBe(false);
  });

  it('is complete when all levels have at least one approval', () => {
    expect(approvalState([
      approval({ level: 1 }),
      approval({ level: 2 }),
    ]).complete).toBe(true);
  });

  it('takes one approval per level, not one per person', () => {
    // Two technical authorities at level 1; either signing clears it.
    expect(approvalState([
      approval({ level: 1, approver_id: 'a', status: 'Approved' }),
      approval({ level: 1, approver_id: 'b', status: 'Pending' }),
    ]).complete).toBe(true);
  });

  it('is never complete while anyone has rejected', () => {
    const state = approvalState([
      approval({ level: 1, status: 'Approved' }),
      approval({ level: 2, status: 'Rejected' }),
    ]);
    expect(state.rejected).toHaveLength(1);
    expect(state.complete).toBe(false);
  });

  it('is not complete when there are no approvers at all', () => {
    // An empty approval list is not a passed gate. This is the failure
    // mode a naive `every()` would produce.
    expect(approvalState([]).complete).toBe(false);
  });
});

describe('advancing a change', () => {
  const approved = [approval({ level: 1 }), approval({ level: 2 })];

  it('refuses a stage that is not next', () => {
    const result = canAdvance(moc({ stage: 'Draft' }), 'Implementation');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/can only move to/);
  });

  it('refuses to implement while an approval level has not signed', () => {
    const result = canAdvance(moc({ stage: 'Approval' }), 'Implementation', {
      approvals: [approval({ level: 1 }), approval({ level: 2, status: 'Pending' })],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/level 2 has not signed/i);
  });

  it('refuses to implement when nobody has been asked to approve', () => {
    const result = canAdvance(moc({ stage: 'Approval' }), 'Implementation', { approvals: [] });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/No approvers have been assigned/);
  });

  it('refuses to implement a rejected change outright', () => {
    const result = canAdvance(moc({ stage: 'Approval' }), 'Implementation', {
      approvals: [approval({ level: 1, status: 'Rejected' })],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/rejected/i);
  });

  it('refuses to implement while pre-implementation actions are open', () => {
    // They exist to be done before the change goes in. That ordering
    // is the whole point of splitting the action list.
    const result = canAdvance(moc({ stage: 'Approval' }), 'Implementation', {
      approvals: approved,
      actions: [action({ action_type: 'Pre-implementation', status: 'Open' })],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/pre-implementation action/i);
  });

  it('does not let a POST-implementation action block implementation', () => {
    const result = canAdvance(moc({ stage: 'Approval' }), 'Implementation', {
      approvals: approved,
      actions: [action({ action_type: 'Post-implementation', status: 'Open' })],
    });
    expect(result.ok).toBe(true);
  });

  it('refuses to implement a temporary change with no expiry date', () => {
    const result = canAdvance(
      moc({ stage: 'Approval', type: 'Temporary', expiry_date: null }),
      'Implementation',
      { approvals: approved },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/expiry date/);
  });

  it('allows implementation once every gate is satisfied', () => {
    expect(canAdvance(moc({ stage: 'Approval' }), 'Implementation', {
      approvals: approved,
      actions: [action({ status: 'Complete' })],
    }).ok).toBe(true);
  });

  it('refuses to close while implementation actions are open', () => {
    const result = canAdvance(moc({ stage: 'Implementation' }), 'Closed', {
      actions: [action({ action_type: 'Post-implementation', status: 'Open' })],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/post-implementation action/i);
  });

  it('treats a cancelled action as not blocking', () => {
    expect(canAdvance(moc({ stage: 'Implementation' }), 'Closed', {
      actions: [action({ action_type: 'Post-implementation', status: 'Cancelled' })],
    }).ok).toBe(true);
  });

  it('always allows cancelling a live change', () => {
    ACTION_TYPES.forEach(() => {});
    ['Draft', 'Screening', 'Review', 'Approval', 'Implementation'].forEach((stage) => {
      expect(nextStages(stage)).toContain('Cancelled');
    });
  });

  it('treats closed, rejected and cancelled as final', () => {
    ['Closed', 'Rejected', 'Cancelled'].forEach((stage) => {
      expect(nextStages(stage)).toEqual([]);
      expect(canAdvance(moc({ stage }), 'Draft').reason).toMatch(/final/);
    });
  });
});

describe('rollup', () => {
  const records = [
    moc({ id: 1, type: 'Temporary', stage: 'Implementation', expiry_date: '2025-01-01' }),
    moc({ id: 2, type: 'Temporary', stage: 'Implementation', expiry_date: '2026-09-25' }),
    moc({ id: 3, stage: 'Approval', target_implementation_date: '2025-01-01' }),
    moc({ id: 4, stage: 'Closed', risk_level: 'High' }),
  ];
  const actions = [
    action({ status: 'Open', due_date: '2025-01-01' }),
    action({ status: 'Complete', due_date: '2025-01-01' }),
  ];

  it('counts expired temporary changes, which the app never showed at all', () => {
    const s = summarise(records, { actions }, TODAY);
    expect(s.expired).toBe(1);
    expect(s.expiringSoon).toBe(1);
    expect(s.overdue).toBe(1);
    expect(s.awaitingApproval).toBe(1);
    expect(s.active).toBe(3);
    expect(s.openActions).toBe(1);
    expect(s.overdueActions).toBe(1);
  });

  it('counts every record into exactly one stage', () => {
    const s = summarise(records, { actions }, TODAY);
    expect(Object.values(s.byStage).reduce((a, b) => a + b, 0)).toBe(records.length);
  });

  it('sorts an expired temporary change above everything else', () => {
    // It is the one actually on the facility without authority.
    const order = [...records].sort(byUrgency(TODAY)).map((m) => m.id);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('groups by a field and labels rows that do not say', () => {
    expect(countBy([{ category: 'Other' }, { category: null }], 'category'))
      .toEqual([{ name: 'Other', count: 1 }, { name: 'Unspecified', count: 1 }]);
  });

  it('gives every stage a token and a chart colour', () => {
    STAGES.forEach((s) => {
      expect(STAGE_TOKENS[s]).toMatch(/^--/);
      expect(STAGE_CHART_COLORS[s]).toMatch(/^#/);
    });
  });
});

describe('GUARD: there is only one MOC authority', () => {
  const ROOT = path.resolve(__dirname, '../../..');
  const AUTHORITY = path.join('src', 'lib', 'managementOfChange.js');

  const codeOf = (file) =>
    fs.readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const walk = (dir, out = []) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '__tests__') return;
        walk(full, out);
      } else if (/\.(js|jsx)$/.test(e.name)) {
        out.push(full);
      }
    });
    return out;
  };

  const APP = path.join(ROOT, 'src', 'pages', 'apps', 'assurance', 'moc');
  const scanned = [APP, path.join(ROOT, 'src', 'lib')]
    .filter((d) => fs.existsSync(d))
    .flatMap((d) => walk(d))
    .filter((f) => !f.endsWith(AUTHORITY));

  it('scans a non-empty set of files, or it proves nothing', () => {
    expect(scanned.length).toBeGreaterThan(5);
  });

  it('no file writes its own stage colour map', () => {
    // Register.jsx had getStageBadge() as a switch returning class
    // names, with a silent default.
    const offenders = scanned.filter((f) =>
      /case\s+'(Screening|Approval|Implemented|Implementation)'/.test(codeOf(f)));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('no file decides for itself whether a change may advance', () => {
    const offenders = scanned.filter((f) => {
      const src = codeOf(f);
      return /stage\s*===\s*['"]Approval['"]\s*&&/.test(src)
        || /setStage\(['"]Implementation['"]\)/.test(src);
    });
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('no file compares an expiry date to now on its own', () => {
    const offenders = scanned.filter((f) =>
      /new Date\((?:\w+\.)?expiry_date\)\s*[<>]/.test(codeOf(f)));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('every file in the app that derives something imports it from here', () => {
    const derives = scanned.filter(
      (f) => f.startsWith(APP) && /summarise|canAdvance|isExpired|STAGE_TOKENS|approvalState/.test(codeOf(f)));
    expect(derives.length).toBeGreaterThan(0);
    derives.forEach((f) => expect(codeOf(f)).toMatch(/managementOfChange/));
  });

  it('the vocabularies match the database constraints added in AS6', () => {
    const migration = fs.readFileSync(
      path.join(ROOT, 'supabase/migrations/20260917400000_as6_management_of_change.sql'), 'utf8');
    [...STAGES, ...CHANGE_TYPES, ...CATEGORIES, ...RISK_LEVELS,
      ...APPROVAL_STATUSES, ...ACTION_TYPES, ...IMPACT_SEVERITIES]
      .forEach((v) => expect(migration).toContain(`'${v}'`));
  });

  it('the unique constraint the create path relies on is still named', () => {
    // AS6 adds no unique index of its own: moc_records_org_id_moc_code_key
    // comes from the AS1 backfill.
    const backfill = fs.readFileSync(
      path.join(ROOT, 'supabase/migrations/20260916099000_as1_assurance_schema_backfill.sql'), 'utf8');
    expect(backfill).toContain('moc_records_org_id_moc_code_key');
  });
});
