/**
 * ASC-1: the apps against engines #213.
 *
 * A Reported ISO audit is delivered, so it is not overdue (as in the
 * audit module). The unevidenced-claim readiness line names what is
 * missing. The Due soon reason names the default lead time. The pages
 * show the engine's answers and do not restate them.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render } from '@testing-library/react';
import { ASSURANCE_HELP } from '@/data/assuranceHelp';
import {
  certificationReadiness, isAuditOverdue, missingEvidenceParts,
} from '@/lib/isoCompliance';
import { explainStatus } from '@/lib/complianceStatus';
import { EvidenceBadge } from '../components/ISOBadges';

const ROOT = path.resolve(__dirname, '../../../../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const textOf = (g) => [
  g.title, g.summary,
  ...g.sections.flatMap((s) => [s.title, ...(s.paragraphs || []), ...(s.bullets || []), ...(s.steps || [])]),
  ...g.glossary.flatMap((t) => [t.term, t.definition]),
].join('\n');

const TODAY = new Date(2026, 8, 18);

describe('a Reported audit is not overdue', () => {
  it('the engine', () => {
    const late = { planned_end: '2026-09-01' };
    expect(isAuditOverdue({ ...late, status: 'Fieldwork complete' }, TODAY)).toBe(true);
    expect(isAuditOverdue({ ...late, status: 'Reported' }, TODAY)).toBe(false);
  });

  it('the Internal audits page asks the engine and restates no status list', () => {
    const src = read('src/pages/apps/assurance/iso-compliance/InternalAudits.jsx');
    expect(src).toMatch(/overdue: isAuditOverdue\(a, today\)/);
    expect(src).not.toMatch(/'Fieldwork complete', 'Reported'\]\.includes/);
  });

  it('the guides', () => {
    expect(textOf(ASSURANCE_HELP.iso)).not.toMatch(/Fieldwork complete or Reported past its planned end/);
    expect(textOf(ASSURANCE_HELP.iso)).toMatch(/a Reported audit was delivered, so it is not overdue/);
    expect(textOf(ASSURANCE_HELP.hub)).toMatch(/past its planned end and still not reported/);
  });
});

describe('the evidence record names what is missing', () => {
  const claim = {
    status: 'Conformant', applicability: 'Applicable',
    assessed_date: '2026-09-01', assessed_by: 'u1', evidence_reference: '',
  };

  it('the engine readiness line', () => {
    expect(missingEvidenceParts(claim)).toEqual(['evidence reference']);
    const { blockers = [] } = certificationReadiness({ id: 's', code: 'ISO 9001', cycle_years: 3 },
      { clauses: [{ id: 'c', standard_id: 's', ...claim }], findings: [], actions: [], audits: [], auditClauses: [] },
      TODAY);
    const line = JSON.stringify(blockers);
    expect(line).toMatch(/no evidence reference recorded/);
    expect(line).not.toMatch(/no evidence, date or assessor/);
  });

  it('the No evidence badge names the missing part only', () => {
    const { container } = render(<EvidenceBadge clause={claim} />);
    const title = container.querySelector('[title]').getAttribute('title');
    expect(title).toBe('Marked conformant. Not recorded: evidence reference.');
  });

  it('no ISO page restates the old sentence', () => {
    ['components/ISOBadges.jsx', 'Dashboard.jsx'].forEach((f) => {
      const src = read(`src/pages/apps/assurance/iso-compliance/${f}`);
      expect(src).not.toMatch(/no evidence reference, assessment date or assessor recorded/);
      expect(src).not.toMatch(/nothing recorded behind it/);
    });
  });

  it('the guide', () => {
    expect(textOf(ASSURANCE_HELP.iso)).toMatch(/the line names what is missing/);
  });
});

describe('the default lead time is called the default', () => {
  it('the engine', () => {
    const { status, reason } = explainStatus({
      lifecycle: 'Active', frequency: 'Annual', due_date: '2026-09-28', lead_time_days: null,
    }, TODAY);
    expect(status).toBe('Due soon');
    expect(reason).toMatch(/inside the default 30 day lead time \(none is set for this obligation\)/);
  });

  it('the obligation page says the default applies', () => {
    const src = read('src/pages/apps/assurance/regulatory-compliance/ComplianceDetail.jsx');
    expect(src).toMatch(/\$\{DEFAULT_LEAD_TIME_DAYS\} days, the default \(none is set\)/);
  });

  it('the guide', () => {
    expect(textOf(ASSURANCE_HELP.regulatory)).toMatch(/the default 30 day lead time applied because none is set/);
  });
});
