// A small Brevo API v3 client for the email marketer: contact lists,
// contact upserts, attributes, email campaigns, test sends and stats.
// fetch with the api-key header; fetchImpl is injected in tests, so nothing
// here reaches the network under jest. The key is never logged.
//
// The Brevo account has an authorised-IP allowlist. A call from a host that
// is not on it answers 401 "unrecognised IP address"; the error says which
// host to add (the worker box is 76.13.39.2).

export const BREVO_BASE = 'https://api.brevo.com/v3';
export const WORKER_IP = '76.13.39.2';

export class BrevoError extends Error {
  constructor(message, { status, code, body } = {}) {
    super(message);
    this.name = 'BrevoError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/** A readable error for a failed Brevo call, with the IP allowlist case spelt out. */
export function brevoError(method, path, status, text) {
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  const msg = body?.message || String(text || '').slice(0, 300);
  if (status === 401 && /unrecogni[sz]ed IP|authori[sz]ed[_ ]ips|IP address/i.test(msg)) {
    const ip = (msg.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/) || [WORKER_IP])[0];
    return new BrevoError(
      `Brevo refused the call from IP ${ip}: the account only accepts API calls from authorised IPs. `
      + `Add ${ip} at https://app.brevo.com/security/authorised_ips (Security, Authorised IPs), `
      + 'or use an API key without the IP restriction. Nothing was sent.',
      { status, code: 'ip_not_authorised', body },
    );
  }
  if (status === 401) return new BrevoError(`Brevo refused the API key (401): ${msg}. Check BREVO_API_KEY in /root/.ai-employees.env.`, { status, code: body?.code || 'unauthorized', body });
  return new BrevoError(`Brevo ${method} ${path} failed (${status}): ${msg}`, { status, code: body?.code, body });
}

export function createBrevoClient({ apiKey, fetchImpl = globalThis.fetch, base = BREVO_BASE } = {}) {
  if (!apiKey) throw new Error('No BREVO_API_KEY. Add it to /root/.ai-employees.env (chmod 600).');
  async function req(method, path, body) {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { 'api-key': apiKey, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = typeof res.text === 'function' ? await res.text() : '';
    if (!res.ok) throw brevoError(method, path.split('?')[0], res.status, text);
    if (!text) return { status: res.status };
    try { return JSON.parse(text); } catch { return { status: res.status, text }; }
  }

  return {
    /** Every contact list, paging through 50 at a time. */
    async listLists() {
      const all = [];
      for (let offset = 0; ; offset += 50) {
        const r = await req('GET', `/contacts/lists?limit=50&offset=${offset}&sort=desc`);
        const page = r?.lists || [];
        all.push(...page);
        if (page.length < 50 || all.length >= (r?.count ?? all.length)) break;
      }
      return all;
    },
    listFolders: async () => (await req('GET', '/contacts/folders?limit=50&offset=0'))?.folders || [],
    createFolder: (name) => req('POST', '/contacts/folders', { name }),
    createList: ({ name, folderId }) => req('POST', '/contacts/lists', { name, folderId }),
    updateList: (listId, { name, folderId }) => req('PUT', `/contacts/lists/${listId}`, { name, ...(folderId ? { folderId } : {}) }),

    /** Find a list by exact name, or create it in the folder. Returns { id, created }. */
    async ensureList(name, folderName = 'Petrolord AI email marketer') {
      const found = (await this.listLists()).find((l) => l.name === name);
      if (found) return { id: found.id, created: false };
      let folder = (await this.listFolders()).find((f) => f.name === folderName);
      if (!folder) folder = { id: (await this.createFolder(folderName)).id };
      const made = await this.createList({ name, folderId: folder.id });
      return { id: made.id, created: true };
    },

    listAttributes: async () => (await req('GET', '/contacts/attributes'))?.attributes || [],
    createTextAttribute: (name) => req('POST', `/contacts/attributes/normal/${encodeURIComponent(name)}`, { type: 'text' }),
    /** Creates the missing ones of these text attributes; returns those created. */
    async ensureAttributes(names) {
      const have = new Set((await this.listAttributes()).map((a) => a.name));
      const made = [];
      for (const n of names) if (!have.has(n)) { await this.createTextAttribute(n); made.push(n); }
      return made;
    },

    /**
     * Create or update one contact and add it to listIds. updateEnabled makes
     * it an upsert. It never touches emailBlacklisted, so a contact who
     * unsubscribed stays unsubscribed.
     */
    upsertContact: ({ email, attributes, listIds }) => req('POST', '/contacts', { email, attributes, listIds, updateEnabled: true }),
    /** Bulk import (asynchronous in Brevo); used for larger lists. */
    importContacts: ({ contacts, listIds }) => req('POST', '/contacts/import', {
      jsonBody: contacts.map((c) => ({ email: c.email, attributes: c.attributes })),
      listIds,
      updateExistingContacts: true,
      emptyContactsAttributes: false,
    }),

    /** Emails of the contacts in a list (paging 500 at a time). */
    async listEmails(listId) {
      const out = [];
      for (let offset = 0; ; offset += 500) {
        const r = await req('GET', `/contacts/lists/${listId}/contacts?limit=500&offset=${offset}`);
        const page = r?.contacts || [];
        out.push(...page.map((c) => String(c.email || '').toLowerCase()).filter(Boolean));
        if (page.length < 500) break;
      }
      return out;
    },
    /** Take contacts out of a list (the contact itself stays in Brevo). */
    removeFromList: (listId, emails) => req('POST', `/contacts/lists/${listId}/contacts/remove`, { emails }),

    /** Draft (no scheduledAt) or scheduled campaign. Returns { id }. */
    createCampaign: (body) => req('POST', '/emailCampaigns', body),
    updateCampaign: (id, body) => req('PUT', `/emailCampaigns/${id}`, body),
    /** Recent campaigns, newest first, for finding one this worker already made. */
    listCampaigns: async ({ limit = 100, offset = 0 } = {}) => (await req('GET', `/emailCampaigns?limit=${limit}&offset=${offset}&sort=desc`))?.campaigns || [],
    sendTest: (id, emailTo) => req('POST', `/emailCampaigns/${id}/sendTest`, { emailTo }),
    getCampaign: (id) => req('GET', `/emailCampaigns/${id}?statistics=globalStats`),
  };
}

/** The numbers report.mjs keeps from a campaign's globalStats. */
export function campaignStats(campaign) {
  const g = campaign?.statistics?.globalStats || {};
  const n = (k) => Number(g[k] || 0);
  const delivered = n('delivered');
  const stats = {
    status: campaign?.status || null,
    sent: n('sent'),
    delivered,
    opens: n('uniqueViews'),
    clicks: n('uniqueClicks'),
    unsubscribes: n('unsubscriptions'),
    hard_bounces: n('hardBounces'),
    soft_bounces: n('softBounces'),
    complaints: n('complaints'),
  };
  stats.bounces = stats.hard_bounces + stats.soft_bounces;
  stats.open_rate = delivered ? stats.opens / delivered : null;
  stats.click_rate = delivered ? stats.clicks / delivered : null;
  stats.unsubscribe_rate = delivered ? stats.unsubscribes / delivered : null;
  stats.bounce_rate = stats.sent ? stats.bounces / stats.sent : null;
  return stats;
}
