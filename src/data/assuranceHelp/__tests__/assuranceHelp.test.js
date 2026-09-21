/**
 * AS13: the Assurance help guides say what the software does.
 *
 * Before AS13 the module had one guide, and it was wrong: a search box
 * that searched nothing, a "coming soon" toast, and scoring help written
 * before residual risk and appetite existed. Two other apps had help
 * buttons wired to nothing. This suite holds the replacements to four
 * things: every app and the hub has a complete guide, the copy follows
 * the owner's rule, the numbers a guide states are the engine's own
 * constants (so a rule change that forgets its guide fails here), and
 * every app shell actually opens its guide.
 */
import fs from 'fs';
import path from 'path';
import { ASSURANCE_HELP, ASSURANCE_HELP_KEYS } from '..';
import { HUB_APP_KEYS } from '@/lib/assuranceHub';
import { RISK_BANDS } from '@/lib/riskScoring';
import { DEFAULT_LEAD_TIME_DAYS } from '@/lib/complianceStatus';
import { DEFAULT_REVIEW_PERIOD_MONTHS, REVIEW_LEAD_DAYS as DOC_LEAD } from '@/lib/documentControl';
import { EXPIRY_LEAD_DAYS } from '@/lib/managementOfChange';
import { CERTIFICATE_LEAD_DAYS } from '@/lib/isoCompliance';

const ROOT = path.resolve(__dirname, '../../../..');
const APP_SECTIONS = ['purpose', 'getting-started', 'rules', 'workflow', 'reports', 'limits', 'faq'];
const HUB_SECTIONS = ['purpose', 'getting-started', 'rules', 'reports', 'limits', 'faq'];

const textOf = (g) => [
  g.title, g.summary,
  ...g.sections.flatMap((s) => [s.title, ...(s.paragraphs || []), ...(s.bullets || []), ...(s.steps || [])]),
  ...g.glossary.flatMap((t) => [t.term, t.definition]),
].join('\n');

describe('the Assurance help guides', () => {
  it('cover the hub and every one of the nine apps, and nothing else', () => {
    expect([...ASSURANCE_HELP_KEYS].sort()).toEqual(['hub', ...HUB_APP_KEYS].sort());
  });

  it.each(ASSURANCE_HELP_KEYS)('%s declares its own key', (key) => {
    expect(ASSURANCE_HELP[key].appKey).toBe(key);
  });

  it.each(ASSURANCE_HELP_KEYS)('%s has every required section, in order, with content', (key) => {
    const g = ASSURANCE_HELP[key];
    expect(g.sections.map((s) => s.id)).toEqual(key === 'hub' ? HUB_SECTIONS : APP_SECTIONS);
    g.sections.forEach((s) => {
      const n = (s.paragraphs || []).length + (s.bullets || []).length + (s.steps || []).length;
      expect({ section: s.id, n: n > 0 }).toEqual({ section: s.id, n: true });
    });
    expect(g.glossary.length).toBeGreaterThanOrEqual(key === 'hub' ? 5 : 8);
  });

  it.each(ASSURANCE_HELP_KEYS)('%s follows the copy rule', (key) => {
    const t = textOf(ASSURANCE_HELP[key]);
    expect(t).not.toMatch(/[—–]/);
    expect(t).not.toMatch(/\s--\s/);
  });

  it.each(ASSURANCE_HELP_KEYS)('%s advertises nothing the old guides invented', (key) => {
    const t = textOf(ASSURANCE_HELP[key]);
    expect(t).not.toMatch(/coming soon|keyboard shortcut|\bundo\b|not (yet )?implemented|next prompt/i);
  });

  it('the hub claims no score', () => {
    const t = textOf(ASSURANCE_HELP.hub);
    expect(t).toMatch(/There is no assurance score/);
  });
});

describe('the numbers a guide states are the engine\'s', () => {
  const t = (k) => textOf(ASSURANCE_HELP[k]);

  it('risk bands', () => {
    RISK_BANDS.forEach((b) => expect(t('risk')).toMatch(new RegExp(`\\b${b.min} to ${b.max}\\b`)));
  });
  it('the obligation lead time', () => {
    expect(t('regulatory')).toMatch(new RegExp(`\\b${DEFAULT_LEAD_TIME_DAYS} days\\b`));
  });
  it('the document review period and window', () => {
    expect(t('documents')).toMatch(new RegExp(`\\b${DEFAULT_REVIEW_PERIOD_MONTHS} months\\b`));
    expect(t('documents')).toMatch(new RegExp(`\\b${DOC_LEAD} days\\b`));
  });
  it('the temporary change expiry window', () => {
    expect(t('moc')).toMatch(new RegExp(`\\b${EXPIRY_LEAD_DAYS} days\\b`));
  });
  it('the certificate window', () => {
    expect(t('iso')).toMatch(new RegExp(`\\b${CERTIFICATE_LEAD_DAYS} days\\b`));
  });
  it('the AS13-0 rules are described as they now are', () => {
    expect(t('regulatory')).toMatch(/One-off obligation is discharged/);
    expect(t('quality')).toMatch(/hold point to Not applicable needs the same record as a waiver/);
    expect(t('moc')).toMatch(/Closed out/);
  });
});

describe('every Assurance screen opens its guide', () => {
  const SHELLS = {
    risk: 'src/pages/apps/risk-register/components/RiskRegisterShell.jsx',
    regulatory: 'src/pages/apps/assurance/regulatory-compliance/RegulatoryCompliancePageShell.jsx',
    documents: 'src/pages/apps/assurance/document-control/components/DocControlShell.jsx',
    peerReview: 'src/pages/apps/assurance/peer-review/components/PeerReviewShell.jsx',
    moc: 'src/pages/apps/assurance/moc/components/MOCPageShell.jsx',
    quality: 'src/pages/apps/assurance/qa-plan/components/QAPlanShell.jsx',
    iso: 'src/pages/apps/assurance/iso-compliance/components/ISOShell.jsx',
    lessons: 'src/pages/apps/assurance/lessons-learned/components/LessonsShell.jsx',
    audits: 'src/pages/apps/assurance/audit-manager/components/AuditShell.jsx',
    hub: 'src/pages/dashboard/AssuranceHub.jsx',
  };

  it('names a shell for every guide', () => {
    expect(Object.keys(SHELLS).sort()).toEqual([...ASSURANCE_HELP_KEYS].sort());
  });

  it.each(Object.entries(SHELLS))('%s', (key, file) => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(src).toMatch(/import AssuranceHelp from '@\/components\/assurance\/AssuranceHelp'/);
    expect(src).toMatch(new RegExp(`<AssuranceHelp appKey="${key}"`));
    expect(src).not.toMatch(/goes here/);
  });

  it('the dead guides and buttons are gone', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/pages/apps/risk-register/components/HelpGuide.jsx'))).toBe(false);
    expect(fs.readFileSync(path.join(ROOT, SHELLS.moc), 'utf8')).not.toMatch(/Support Guide/);
  });
});
