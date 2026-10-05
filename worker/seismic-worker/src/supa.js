// Thin Supabase REST client for the worker (service role). Mirrors the sim
// worker's supa.py: retries transient failures with backoff, never logs the
// key. `fetchImpl` is injectable so the queue protocol can be tested against
// an in-memory double.
const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);

export function createSupa({ url, key, fetchImpl = globalThis.fetch, retries = 4, sleep = defaultSleep }) {
  const headers = (extra) => ({
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  });

  async function request(method, path, { body, extraHeaders } = {}) {
    let delay = 1000;
    let last;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        const resp = await fetchImpl(`${url}${path}`, {
          method,
          headers: headers(extraHeaders),
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!TRANSIENT.has(resp.status)) return resp;
        last = new Error(`${method} ${path} -> ${resp.status}`);
      } catch (e) {
        last = e;
      }
      if (attempt < retries - 1) {
        await sleep(delay);
        delay *= 2;
      }
    }
    throw last;
  }

  async function json(method, path, opts) {
    const resp = await request(method, path, opts);
    const text = await resp.text();
    if (!resp.ok) throw new Error(`${method} ${path} -> ${resp.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }

  return {
    rpc: (fn, args) => json('POST', `/rest/v1/rpc/${fn}`, { body: args }),
    patch: (table, query, fields) => json('PATCH', `/rest/v1/${table}?${query}`, {
      body: fields,
      extraHeaders: { Prefer: 'return=representation' },
    }),
    select: (table, query) => json('GET', `/rest/v1/${table}?${query}`),
  };
}

function defaultSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
