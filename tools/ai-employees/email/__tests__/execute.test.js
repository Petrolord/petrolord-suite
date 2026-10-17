/**
 * @jest-environment node
 */
import { executeBlocker, dueTasks, resolveAudience, campaignBody, sendTime } from '../lib/campaign.mjs';
import { runCampaignTask } from '../lib/run-campaign.mjs';
import { testSend } from '../lib/test-send.mjs';
import { napeTasks } from '../lib/series.mjs';

const NOW = Date.parse('2026-10-20T08:00:00Z');
const employee = { id: 'e2', status: 'active' };
const config = { 'nape-optins': { list_ids: [2] } };
const brevoLists = [{ id: 7, name: 'NAPE 2026 leads' }, { id: 8, name: 'NAPE 2026 leads: suite' }, { id: 9, name: 'NAPE 2026 leads: nextgen' }];
const drafts = napeTasks({ apps: 105, modulesWord: 'Ten', courses: 80, appCourses: 73 });

function approved(i, extra = {}) {
  const d = drafts[i];
  const facts = Object.fromEntries(d.payload.placeholders.map((p) => [p, p === '[BOOTH NUMBER]' ? 'B12' : 'Filled']));
  return { id: `t${i + 1}`, employee_id: 'e2', kind: d.kind, title: d.title, status: 'approved', reviewer_email: 'ayoasaolu@lordswayenergy.com', reviewed_at: '2026-10-19T10:00:00Z', payload: { ...d.payload, facts }, ...extra };
}

function mocks({ campaigns = [], actions = [], createError = null } = {}) {
  const log = [];
  const updates = [];
  const created = [];
  const db = {
    actions: async () => actions,
    logAction: async (a) => { log.push(a); },
    updateTask: async (id, patch, opts) => { updates.push({ id, patch, opts }); return { id, ...patch }; },
  };
  const brevo = {
    listLists: async () => brevoLists,
    listCampaigns: async () => campaigns,
    createCampaign: async (body) => { if (createError) throw createError; created.push(body); return { id: 900 + created.length }; },
  };
  return { db, brevo, log, updates, created };
}

test('an approved, filled, due task creates one scheduled campaign and is marked done', async () => {
  const m = mocks();
  const r = await runCampaignTask({ task: approved(0), employee, db: m.db, brevo: m.brevo, config, now: NOW, log: () => {} });
  expect(r.campaignId).toBe(901);
  expect(m.created).toHaveLength(1);
  const body = m.created[0];
  expect(body.sender).toEqual({ name: 'Petrolord', email: 'info@lordswayenergy.com' });
  expect(body.replyTo).toBe('info@lordswayenergy.com');
  expect(body.recipients.listIds).toEqual([2, 7]);
  expect(body.scheduledAt).toBe('2026-10-21T08:00:00.000Z');
  expect(body.htmlContent).toContain('B12');
  expect(body.htmlContent).not.toContain('[BOOTH NUMBER]');
  expect(body.name).toContain('t1');
  expect(m.updates[0]).toMatchObject({ id: 't1', patch: { status: 'done', result: { brevo_campaign_id: 901 } }, opts: { fromStatus: 'approved' } });
  expect(m.log.map((a) => a.action)).toEqual(['campaign_create_started', 'campaign_scheduled']);
});

test('negative control: never sends a task without approval or a reviewer', async () => {
  for (const extra of [{ status: 'proposed' }, { status: 'rejected' }, { reviewer_email: null }, { reviewed_at: null }]) {
    const m = mocks();
    const r = await runCampaignTask({ task: approved(0, extra), employee, db: m.db, brevo: m.brevo, config, now: NOW, log: () => {} });
    expect(r.skipped).toBeTruthy();
    expect(m.created).toHaveLength(0);
    expect(m.updates).toHaveLength(0);
  }
});

test('blocked while paused, unfilled, without unsubscribe, to another audience, or stale', () => {
  const t = approved(0);
  expect(executeBlocker({ task: t, employee: { status: 'paused' }, now: NOW })).toMatch(/paused/);
  expect(executeBlocker({ task: { ...t, payload: { ...t.payload, facts: {} } }, employee, now: NOW })).toMatch(/placeholders not filled: .*BOOTH NUMBER/);
  expect(executeBlocker({ task: { ...t, payload: { ...t.payload, html: t.payload.html.replace('{{ unsubscribe }}', '#') } }, employee, now: NOW })).toMatch(/unsubscribe/);
  expect(executeBlocker({ task: { ...t, payload: { ...t.payload, audience: ['all-suite-users'] } }, employee, now: NOW })).toMatch(/not allowed/);
  expect(executeBlocker({ task: { ...t, kind: 'youtube_listing' }, employee, now: NOW })).toMatch(/kind/);
  expect(executeBlocker({ task: t, employee, now: Date.parse('2026-10-24T08:00:00Z') })).toMatch(/passed more than 48 h/);
  expect(executeBlocker({ task: t, employee, now: NOW })).toBeNull();
});

test('idempotent: a task with a campaign id is skipped; a campaign already in Brevo is adopted', async () => {
  const m1 = mocks();
  const r1 = await runCampaignTask({ task: approved(0, { result: { brevo_campaign_id: 55 } }), employee, db: m1.db, brevo: m1.brevo, config, now: NOW, log: () => {} });
  expect(r1.skipped).toMatch(/already exists/);
  expect(m1.created).toHaveLength(0);

  const m2 = mocks({ campaigns: [{ id: 77, name: 'AI nape2026-1 task t1' }], actions: [{ action: 'campaign_create_started' }] });
  const r2 = await runCampaignTask({ task: approved(0), employee, db: m2.db, brevo: m2.brevo, config, now: NOW, log: () => {} });
  expect(r2.campaignId).toBe(77);
  expect(m2.created).toHaveLength(0);
  expect(m2.updates[0].patch.result).toMatchObject({ brevo_campaign_id: 77, adopted: true });
});

test('an unfinished earlier create is held until --force', async () => {
  const m = mocks({ actions: [{ action: 'campaign_create_started' }] });
  const r = await runCampaignTask({ task: approved(0), employee, db: m.db, brevo: m.brevo, config, now: NOW, log: () => {} });
  expect(r.skipped).toMatch(/unfinished/);
  expect(m.created).toHaveLength(0);
  const f = await runCampaignTask({ task: approved(0), employee, db: m.db, brevo: m.brevo, config, now: NOW, force: true, log: () => {} });
  expect(f.campaignId).toBeTruthy();
});

test('a missing opt-in list id or an IP refusal holds the task approved (nothing failed, nothing sent)', async () => {
  const m = mocks();
  const r = await runCampaignTask({ task: approved(0), employee, db: m.db, brevo: m.brevo, config: { 'nape-optins': { list_ids: [] } }, now: NOW, log: () => {} });
  expect(r.skipped).toMatch(/audiences\.json/);
  expect(m.updates).toHaveLength(0);
  const ipErr = Object.assign(new Error('Brevo refused the call from IP 76.13.39.2'), { status: 401 });
  const m2 = mocks({ createError: ipErr });
  const r2 = await runCampaignTask({ task: approved(0), employee, db: m2.db, brevo: m2.brevo, config, now: NOW, log: () => {} });
  expect(r2.skipped).toMatch(/76\.13\.39\.2/);
  expect(m2.updates).toHaveLength(0);
  expect(m2.log.map((a) => a.action)).toEqual(['campaign_create_started', 'campaign_blocked']);
  // the next run is not held as "unfinished": the block settled it
  const m3 = mocks({ actions: m2.log });
  expect((await runCampaignTask({ task: approved(0), employee, db: m3.db, brevo: m3.brevo, config, now: NOW, log: () => {} })).campaignId).toBeTruthy();
});

test('a dry run calls neither Brevo nor the database', async () => {
  const m = mocks();
  const lines = [];
  const r = await runCampaignTask({ task: approved(1), employee, db: null, brevo: null, config, dryRun: true, now: NOW, log: (l) => lines.push(l) });
  expect(r.dryRun).toBe(true);
  expect(lines[0]).toMatch(/would create/);
  expect(m.created).toHaveLength(0);
});

test('due window: slots within 24 h, oldest first, at most 2 a run', () => {
  const ts = [approved(3), approved(0), approved(1), approved(2)];
  expect(dueTasks(ts, { now: NOW }).map((t) => t.id)).toEqual(['t1']);
  expect(dueTasks(ts, { now: Date.parse('2026-11-10T00:00:00Z') }).map((t) => t.id)).toEqual(['t1', 't2']);
});

test('audience resolution: interest lists for the product email; refuses unknown audiences', () => {
  expect(resolveAudience(['nape-optins', 'nape-2026-leads:suite', 'nape-2026-leads:nextgen'], { config, lists: brevoLists })).toEqual([2, 8, 9]);
  expect(() => resolveAudience(['nape-2026-leads:hse'], { config, lists: brevoLists })).toThrow(/sync-leads/);
  expect(() => resolveAudience(['everyone'], { config, lists: brevoLists })).toThrow(/not allowed/);
});

test('a slot just missed is sent a few minutes later; the sender cannot be changed by the payload', () => {
  expect(sendTime('2026-10-21T08:00:00.000Z', NOW)).toBe('2026-10-21T08:00:00.000Z');
  expect(sendTime('2026-10-20T07:00:00.000Z', NOW)).toBe('2026-10-20T08:15:00.000Z');
  const t = approved(0);
  t.payload.sender = { name: 'Someone', email: 'x@y.com' };
  expect(campaignBody(t, { listIds: [1], scheduledAt: 'x' }).sender).toEqual({ name: 'Petrolord', email: 'info@lordswayenergy.com' });
});

test('test-send goes to the managers only', async () => {
  const sent = [];
  const brevo = { listCampaigns: async () => [], createCampaign: async (b) => { expect(b.recipients).toBeUndefined(); expect(b.scheduledAt).toBeUndefined(); return { id: 5 }; }, sendTest: async (id, to) => sent.push([id, to]) };
  const db = { logAction: async () => {} };
  await testSend({ task: approved(0), employee, db, brevo, log: () => {} });
  expect(sent).toEqual([[5, ['ayoasaolu@lordswayenergy.com', 'seyiojo@lordswayenergy.com']]]);
  await expect(testSend({ task: approved(0), employee, db, brevo, to: ['someone@else.com'], log: () => {} })).rejects.toThrow(/managers only/);
});
