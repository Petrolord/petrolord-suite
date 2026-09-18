/**
 * AS11 — the Assurance hub.
 *
 * The hub this replaces showed literals for five of its apps and left
 * the ninth off the page. These tests hold the rebuilt one to four
 * things: every count is the owning app's own (identity with each
 * app's summarise, not a restatement of it), every attention rule is
 * the app's own predicate, every route it links to is declared, and it
 * returns no score.
 */
import fs from 'fs';
import path from 'path';
import {
  HUB_APPS,
  HUB_APP_KEYS,
  TIER,
  TIER_ORDER,
  attentionByApp,
  attentionItems,
  byAttention,
  moduleHeadline,
  summariseModule,
  summariseRisks,
} from '../assuranceHub';
import { summarise as summariseObligations } from '../complianceStatus';
import { summarise as summariseDocuments } from '../documentControl';
import { summarise as summarisePeerReviews } from '../peerReview';
import { summarise as summariseMoc } from '../managementOfChange';
import { summarise as summariseQuality } from '../qualityAssurance';
import { summarise as summariseIso } from '../isoCompliance';
import { summarise as summariseLessons } from '../lessonsLearned';
import { summarise as summariseAudits } from '../auditManagement';
import { RISK_LIVE_STATUSES, RISK_NOT_LIVE_STATUSES } from '../riskScoring';

import { TODAY, fixture } from './assuranceHubFixture';

const ROOT = path.resolve(__dirname, '..', '..', '..');

describe('the nine apps', () => {
  it('lists nine apps, each once', () => {
    expect(HUB_APPS).toHaveLength(9);
    expect(new Set(HUB_APP_KEYS).size).toBe(9);
  });

  it('includes the Audit & Findings Manager the old hub left off', () => {
    expect(HUB_APPS.map((a) => a.appId)).toContain('audit-findings-manager');
  });
});

describe('every count is the owning app\'s own', () => {
  const data = fixture();
  const s = summariseModule(data, TODAY);

  it.each([
    ['regulatory', () => summariseObligations(data.regulatory.obligations, TODAY)],
    ['documents', () => summariseDocuments(data.documents.documents, TODAY)],
    ['peerReview', () => summarisePeerReviews(data.peerReview.reviews, data.peerReview.comments, TODAY)],
    ['moc', () => summariseMoc(data.moc.records, { actions: data.moc.actions }, TODAY)],
    ['quality', () => summariseQuality(data.quality, TODAY)],
    ['iso', () => summariseIso(data.iso, TODAY)],
    ['lessons', () => summariseLessons(data.lessons, TODAY)],
    ['audits', () => summariseAudits(data.audits, TODAY)],
  ])('%s is exactly the app\'s summarise()', (key, own) => {
    expect(s[key]).toEqual(own());
  });

  it('the risk summary counts live risks only and uses the scoring authority', () => {
    expect(s.risk.total).toBe(5);
    expect(s.risk.live).toBe(3);
    expect(s.risk.byResidualBand.Critical).toBe(1);
    expect(s.risk.aboveAppetite).toBe(1);
    expect(s.risk.reviewsOverdue).toBe(1);
  });

  it('the risk live/not-live split covers the register\'s whole status list', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/pages/apps/risk-register/constants.js'), 'utf8');
    const block = src.match(/RISK_STATUSES\s*=\s*\[([^\]]*)\]/)[1];
    const statuses = block.match(/'([^']+)'/g).map((q) => q.slice(1, -1));
    expect([...RISK_LIVE_STATUSES, ...RISK_NOT_LIVE_STATUSES].sort()).toEqual([...statuses].sort());
  });

  it('an app that could not be read summarises to null, not to zeros', () => {
    const partial = { ...fixture(), moc: null, iso: undefined };
    const out = summariseModule(partial, TODAY);
    expect(out.moc).toBeNull();
    expect(out.iso).toBeNull();
    expect(out.documents).not.toBeNull();
  });

  it('an org with no rows at all summarises to real zeros', () => {
    expect(summariseRisks([], TODAY)).toMatchObject({ total: 0, live: 0, aboveAppetite: 0 });
  });
});

describe('the attention list', () => {
  const items = attentionItems(fixture(), TODAY);
  const find = (app, code, reason) => items.find(
    (i) => i.app === app && i.code === code && (!reason || i.reason.includes(reason)));

  it.each([
    ['risk', 'RSK-0001', TIER.EXPOSED, 'Critical'],
    ['risk', 'RSK-0002', TIER.OVERDUE, 'appetite'],
    ['risk', 'RSK-0003', TIER.OVERDUE, 'review'],
    ['regulatory', 'REG-0001', TIER.EXPOSED, 'expired'],
    ['regulatory', 'REG-0002', TIER.EXPOSED, 'overdue'],
    ['regulatory', 'REG-0003', TIER.DUE_SOON, 'due soon'],
    ['documents', 'OPS-PRO-0001', TIER.OVERDUE, 'overdue'],
    ['documents', 'OPS-PRO-0002', TIER.DUE_SOON, 'due soon'],
    ['peerReview', 'PR-2026-001', TIER.OVERDUE, 'overdue'],
    ['peerReview', 'PR-2026-002', TIER.OVERDUE, 'unresolved'],
    ['moc', 'MOC-2026-001', TIER.EXPOSED, 'expiry'],
    ['moc', 'MOC-2026-002', TIER.DUE_SOON, 'expiring'],
    ['moc', 'MOC-2026-003', TIER.OVERDUE, 'target'],
    ['quality', 'NCR-0001', TIER.EXPOSED, 'Critical'],
    ['quality', 'NCR-0002', TIER.OVERDUE, 'overdue'],
    ['iso', 'F-0001', TIER.OVERDUE, 'Major'],
    ['iso', 'IA-0001', TIER.OVERDUE, 'audit'],
    ['lessons', 'LL-0001', TIER.OVERDUE, 'review'],
    ['audits', 'AF-0001', TIER.EXPOSED, 'Stop-work'],
    ['audits', 'AF-0002', TIER.OVERDUE, 'overdue'],
    ['audits', 'AUD-0001', TIER.OVERDUE, 'overdue'],
  ])('%s %s is %s', (app, code, tier, reason) => {
    const i = find(app, code, reason);
    expect(i).toBeDefined();
    expect(i.tier).toBe(tier);
  });

  it.each([
    ['risk', 'RSK-0004', 'a closed risk'],
    ['risk', 'RSK-0005', 'a draft risk'],
    ['regulatory', 'REG-0004', 'a superseded obligation'],
    ['documents', 'OPS-PRO-0003', 'a document not in force'],
    ['moc', 'MOC-2026-004', 'a temporary change not yet on the facility'],
    ['quality', 'NCR-0003', 'a closed NCR'],
    ['iso', 'F-0002', 'a voided finding'],
    ['lessons', 'LL-0002', 'a draft lesson'],
    ['audits', 'AUD-0002', 'a reported audit'],
  ])('%s %s is not listed: %s', (app, code) => {
    expect(items.filter((i) => i.app === app && i.code === code)).toEqual([]);
  });

  it('counts blocking comments the way the peer review app does', () => {
    // c1 Critical Open and c2 Major Responded block; c3 Minor and c4 Verified do not.
    expect(find('peerReview', 'PR-2026-002', 'unresolved').reason).toMatch(/^2 /);
  });

  it('is ordered worst first: tier, then the longest overdue', () => {
    const tiers = items.map((i) => TIER_ORDER.indexOf(i.tier));
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
    const overdue = items.filter((i) => i.tier === TIER.OVERDUE && i.daysLate !== null);
    const late = overdue.map((i) => i.daysLate);
    expect(late).toEqual([...late].sort((a, b) => b - a));
  });

  it('ranks an undated item after a dated one in the same tier', () => {
    const dated = { tier: TIER.OVERDUE, daysLate: 1, code: 'B' };
    const undated = { tier: TIER.OVERDUE, daysLate: null, code: 'A' };
    expect([undated, dated].sort(byAttention)).toEqual([dated, undated]);
  });

  it('every item links into its own app', () => {
    items.forEach((i) => {
      const app = HUB_APPS.find((a) => a.key === i.app);
      expect(i.href.startsWith(app.base)).toBe(true);
    });
  });

  it('skips apps that could not be read rather than throwing', () => {
    const out = attentionItems({ ...fixture(), moc: null }, TODAY);
    expect(out.some((i) => i.app === 'moc')).toBe(false);
    expect(out.length).toBeGreaterThan(0);
  });

  it('by-app counts add up to the list', () => {
    const rows = attentionByApp(items);
    expect(rows).toHaveLength(9);
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(items.length);
  });
});

describe('there is no assurance score', () => {
  const SCORE = /score|percent|pct|index|rating|grade|health/i;
  const items = attentionItems(fixture(), TODAY);

  it('the headline is counts only', () => {
    const h = moduleHeadline(items, Object.fromEntries(HUB_APP_KEYS.map((k) => [k, true])));
    Object.keys(h).forEach((k) => expect(k).not.toMatch(SCORE));
    Object.values(h).forEach((v) => expect(Number.isInteger(v)).toBe(true));
    expect(h.appsReporting).toBe(9);
  });

  it('an unavailable app is counted as unavailable, not as clean', () => {
    const h = moduleHeadline([], { risk: true });
    expect(h.appsReporting).toBe(1);
    expect(h.appsUnavailable).toBe(8);
  });

  it('no exported function of the hub computes a module score', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/lib/assuranceHub.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/\bexport const \w*(score|percent|index|health)\w*/i);
    expect(src).not.toMatch(/\*\s*100\b/);
  });
});

/* ------------------------------------------------------------------ */
/* Routes: the hub may only link to something that is declared        */
/* ------------------------------------------------------------------ */

const readRoutes = () => {
  const app = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
  const routes = [];
  const re = /<Route\s+path="(apps\/assurance\/[^"]+)"\s+element=\{<ProtectedAppRoute\s+appId="([^"]+)"[^}]*?(?:<(\w+)\s*\/>)/g;
  let m;
  while ((m = re.exec(app))) routes.push({ path: m[1], appId: m[2], component: m[3] });

  // Apps mounted at `.../*` declare their own sub-routes in a page shell.
  const expanded = [];
  routes.forEach((r) => {
    if (!r.path.endsWith('/*')) { expanded.push(r); return; }
    const root = r.path.slice(0, -2);
    const dir = path.join(ROOT, 'src/pages', root.replace(/^apps\/assurance\//, 'apps/assurance/'));
    const shellDir = fs.existsSync(dir) ? dir
      : path.join(ROOT, 'src/pages/apps/assurance', root.split('/').pop());
    const shell = fs.readdirSync(shellDir).find((f) => /PageShell\.jsx$/.test(f));
    const src = fs.readFileSync(path.join(shellDir, shell), 'utf8');
    const sub = [...src.matchAll(/<Route\s+path="([^"]+)"/g)].map((x) => x[1]);
    sub.filter((p) => p !== '*').forEach((p) => expanded.push({
      path: p === '/' ? root : `${root}/${p}`, appId: r.appId,
    }));
  });
  return expanded;
};

const matches = (pattern, url) => {
  const a = pattern.split('/');
  const b = url.split('/');
  return a.length === b.length && a.every((seg, i) => seg.startsWith(':') || seg === b[i]);
};

describe('every route the hub links to is declared', () => {
  const routes = readRoutes();
  const resolve = (url) => routes.find((r) => matches(r.path, url.replace(/^\/dashboard\//, '')));

  it('reads the assurance routes, or it proves nothing', () => {
    expect(routes.length).toBeGreaterThan(30);
  });

  it.each(HUB_APPS.map((a) => [a.name, a]))('%s: base, record and audit routes resolve', (_n, a) => {
    expect(resolve(a.base)).toBeDefined();
    expect(resolve(a.record('00000000-0000-0000-0000-000000000000'))).toBeDefined();
    if (a.audit) expect(resolve(a.audit('00000000-0000-0000-0000-000000000000'))).toBeDefined();
  });

  it.each(HUB_APPS.map((a) => [a.name, a]))('%s: the catalogue id is the one its route is gated on', (_n, a) => {
    expect(resolve(a.base).appId).toBe(a.appId);
  });

  it('a record route never lands on a create page', () => {
    HUB_APPS.forEach((a) => {
      const r = resolve(a.record('00000000-0000-0000-0000-000000000000'));
      expect(r.path).not.toMatch(/\/new$/);
    });
  });
});
