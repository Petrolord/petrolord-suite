/**
 * @jest-environment node
 */
// The Brevo client's request shapes, with an injected fetch: nothing here
// reaches the network.
import { createBrevoClient, brevoError, campaignStats, BREVO_BASE } from '../lib/brevo.mjs';

function fakeFetch(responses = []) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, method: opts.method, headers: opts.headers, body: opts.body ? JSON.parse(opts.body) : undefined });
    const r = responses.shift() || { status: 200, body: {} };
    return { ok: r.status < 400, status: r.status, text: async () => (r.body === undefined ? '' : JSON.stringify(r.body)) };
  };
  fn.calls = calls;
  return fn;
}

test('every call carries the api-key header and goes to api.brevo.com/v3', async () => {
  const f = fakeFetch([{ status: 200, body: { lists: [{ id: 3, name: 'A' }], count: 1 } }]);
  const b = createBrevoClient({ apiKey: 'xkeysib-test', fetchImpl: f });
  expect(await b.listLists()).toEqual([{ id: 3, name: 'A' }]);
  expect(f.calls[0].url).toBe(`${BREVO_BASE}/contacts/lists?limit=50&offset=0&sort=desc`);
  expect(f.calls[0].headers['api-key']).toBe('xkeysib-test');
  expect(f.calls[0].method).toBe('GET');
});

test('no key, no client', () => {
  expect(() => createBrevoClient({ apiKey: '' })).toThrow(/BREVO_API_KEY/);
});

test('ensureList finds an existing list by name and creates nothing (idempotent)', async () => {
  const f = fakeFetch([{ status: 200, body: { lists: [{ id: 7, name: 'NAPE 2026 leads' }], count: 1 } }]);
  const b = createBrevoClient({ apiKey: 'k', fetchImpl: f });
  expect(await b.ensureList('NAPE 2026 leads')).toEqual({ id: 7, created: false });
  expect(f.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
});

test('ensureList creates the folder and the list when missing', async () => {
  const f = fakeFetch([
    { status: 200, body: { lists: [], count: 0 } },
    { status: 200, body: { folders: [] } },
    { status: 201, body: { id: 11 } },
    { status: 201, body: { id: 12 } },
  ]);
  const b = createBrevoClient({ apiKey: 'k', fetchImpl: f });
  expect(await b.ensureList('NAPE 2026 leads')).toEqual({ id: 12, created: true });
  expect(f.calls[2]).toMatchObject({ method: 'POST', url: `${BREVO_BASE}/contacts/folders`, body: { name: 'Petrolord AI email marketer' } });
  expect(f.calls[3]).toMatchObject({ method: 'POST', url: `${BREVO_BASE}/contacts/lists`, body: { name: 'NAPE 2026 leads', folderId: 11 } });
});

test('updateList, upsertContact and importContacts shapes', async () => {
  const f = fakeFetch([{ status: 204 }, { status: 201, body: { id: 1 } }, { status: 202, body: { processId: 9 } }]);
  const b = createBrevoClient({ apiKey: 'k', fetchImpl: f });
  await b.updateList(5, { name: 'Renamed' });
  await b.upsertContact({ email: 'a@b.ng', attributes: { FIRSTNAME: 'Ada' }, listIds: [5] });
  await b.importContacts({ contacts: [{ email: 'c@d.ng', attributes: { COMPANY: 'X' } }], listIds: [5] });
  expect(f.calls[0]).toMatchObject({ method: 'PUT', url: `${BREVO_BASE}/contacts/lists/5`, body: { name: 'Renamed' } });
  expect(f.calls[1].body).toEqual({ email: 'a@b.ng', attributes: { FIRSTNAME: 'Ada' }, listIds: [5], updateEnabled: true });
  expect(f.calls[1].body).not.toHaveProperty('emailBlacklisted'); // never un-unsubscribes anyone
  expect(f.calls[2].body).toEqual({ jsonBody: [{ email: 'c@d.ng', attributes: { COMPANY: 'X' } }], listIds: [5], updateExistingContacts: true, emptyContactsAttributes: false });
});

test('createCampaign, sendTest and getCampaign shapes', async () => {
  const f = fakeFetch([{ status: 201, body: { id: 42 } }, { status: 204 }, { status: 200, body: { id: 42, status: 'sent' } }]);
  const b = createBrevoClient({ apiKey: 'k', fetchImpl: f });
  const body = { name: 'n', subject: 's', previewText: 'p', sender: { name: 'Petrolord', email: 'info@lordswayenergy.com' }, replyTo: 'info@lordswayenergy.com', htmlContent: '<p>x</p>', recipients: { listIds: [1, 2] }, scheduledAt: '2026-10-21T08:00:00.000Z' };
  expect(await b.createCampaign(body)).toEqual({ id: 42 });
  await b.sendTest(42, ['ayoasaolu@lordswayenergy.com']);
  await b.getCampaign(42);
  expect(f.calls[0]).toMatchObject({ method: 'POST', url: `${BREVO_BASE}/emailCampaigns`, body });
  expect(f.calls[1]).toMatchObject({ method: 'POST', url: `${BREVO_BASE}/emailCampaigns/42/sendTest`, body: { emailTo: ['ayoasaolu@lordswayenergy.com'] } });
  expect(f.calls[2].url).toBe(`${BREVO_BASE}/emailCampaigns/42?statistics=globalStats`);
});

test('the authorised-IP refusal says which IP to add and where', async () => {
  const f = fakeFetch([{ status: 401, body: { code: 'unauthorized', message: 'We have detected you are using an unrecognised IP address 76.13.39.2. If you performed this action make sure to add the new IP address in this page: https://app.brevo.com/security/authorised_ips' } }]);
  const b = createBrevoClient({ apiKey: 'k', fetchImpl: f });
  const err = await b.listLists().catch((e) => e);
  expect(err.code).toBe('ip_not_authorised');
  expect(err.status).toBe(401);
  expect(err.message).toMatch(/76\.13\.39\.2/);
  expect(err.message).toMatch(/authorised_ips/);
  expect(err.message).toMatch(/Nothing was sent/);
});

test('a bad key and other errors are told apart from the IP case (negative control)', () => {
  expect(brevoError('GET', '/x', 401, JSON.stringify({ code: 'unauthorized', message: 'Key not found' })).code).toBe('unauthorized');
  const e = brevoError('POST', '/emailCampaigns', 400, JSON.stringify({ code: 'invalid_parameter', message: 'scheduledAt is in the past' }));
  expect(e.code).toBe('invalid_parameter');
  expect(e.message).toMatch(/400.*scheduledAt/);
});

test('campaignStats keeps opens, clicks, unsubscribes and bounces with rates', () => {
  const s = campaignStats({ status: 'sent', statistics: { globalStats: { sent: 200, delivered: 190, uniqueViews: 76, uniqueClicks: 19, unsubscriptions: 1, hardBounces: 4, softBounces: 6 } } });
  expect(s).toMatchObject({ sent: 200, delivered: 190, opens: 76, clicks: 19, unsubscribes: 1, bounces: 10 });
  expect(s.open_rate).toBeCloseTo(0.4);
  expect(s.bounce_rate).toBeCloseTo(0.05);
  expect(campaignStats({}).open_rate).toBeNull();
});
