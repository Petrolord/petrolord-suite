/**
 * AS13 hardening: the help statements corrected in this round, each held
 * to the code that makes it true.
 */
import fs from 'fs';
import path from 'path';
import { ASSURANCE_HELP } from '..';
import { certificateState } from '@/pages/apps/assurance/iso-compliance/utils/isoPayload';
import { certificationReadiness } from '@/lib/isoCompliance';

const ROOT = path.resolve(__dirname, '../../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const textOf = (g) => [
  g.title, g.summary,
  ...g.sections.flatMap((s) => [s.title, ...(s.paragraphs || []), ...(s.bullets || []), ...(s.steps || [])]),
  ...g.glossary.flatMap((t) => [t.term, t.definition]),
].join('\n');

describe('ISO: readiness shows both certificate states', () => {
  const today = new Date(2026, 8, 18);
  const counts = (expires) => certificationReadiness(
    { id: 's1', certificate_expires: expires, cycle_years: 3 }, {}, today).counts;

  it('certificateState names Expired, Expiring soon, or nothing', () => {
    expect(certificateState(counts('2026-09-01'))).toBe('Expired');
    expect(certificateState(counts('2026-10-01'))).toBe('Expiring soon');
    expect(certificateState(counts('2027-09-01'))).toBeNull();
    expect(certificateState(counts(null))).toBeNull();
  });

  it('the Standards page and the Dashboard readiness summary both show it', () => {
    expect(read('src/pages/apps/assurance/iso-compliance/Standards.jsx'))
      .toMatch(/certificateState\(readiness\.counts\)/);
    expect(read('src/pages/apps/assurance/iso-compliance/Dashboard.jsx'))
      .toMatch(/certificateState\(readiness\.counts\)/);
  });

  it('the guide says so, and no longer claims only a count', () => {
    const t = textOf(ASSURANCE_HELP.iso);
    expect(t).not.toMatch(/Readiness shows both in its counts/);
    expect(t).toMatch(/Expiring soon or Expired/);
    expect(t).toMatch(/clause scope is fixed once it is Reported/);
  });
});

describe('Lessons: the attention list and the Embedded rule', () => {
  it('describes the attention list as every lesson sorted, first eight shown', () => {
    const t = textOf(ASSURANCE_HELP.lessons);
    expect(t).toMatch(/every lesson sorted, and the first eight shown/);
    expect(read('src/pages/apps/assurance/lessons-learned/Dashboard.jsx'))
      .toMatch(/\[\.\.\.lessons\]\.sort\(lessonByAttention\([^)]*\)\)\.slice\(0, 8\)/);
  });

  it('states that the last embedding application of an Embedded lesson stays', () => {
    expect(textOf(ASSURANCE_HELP.lessons))
      .toMatch(/last Adopted or Adapted application cannot be removed/);
  });
});

describe('Audits: the unanswered count', () => {
  it('says it includes rows on cancelled audits and leaves out unsynced questions', () => {
    const t = textOf(ASSURANCE_HELP.audits);
    expect(t).toMatch(/cancelled audits included/);
    expect(t).toMatch(/never synced into an audit are not counted/);
  });
});

describe('MOC and QA: the round-one items', () => {
  it('MOC: closed-out changes are shown in the register and left out of the expiry report', () => {
    const t = textOf(ASSURANCE_HELP.moc);
    expect(t).toMatch(/Closed out on its badge, in the register and in the Register CSV/);
    expect(t).toMatch(/left out of the expiry table and the expiry CSV/);
  });

  it('QA: Not applicable on a hold point records the user and asks for the reason', () => {
    const t = textOf(ASSURANCE_HELP.quality);
    expect(t).toMatch(/hold point set to Not applicable needs the same date, verifier and reason/);
    expect(t).toMatch(/failed point of any type, and any open NCR/);
  });
});
