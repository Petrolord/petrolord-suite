// Outbound fetch guard for "import from a link" (QI programme Q0b-3). The
// worker fetches a URL the user typed, so it must not be usable to reach
// anything private: the worker host itself, the object store on the Docker
// network, cloud metadata endpoints, or other machines on a private network
// (server-side request forgery).
//
//   - https only, default port only (443), no credentials in the URL;
//   - every address a name resolves to must be public (checked below);
//   - the connection is pinned to the vetted address, so a second DNS answer
//     cannot swap in a private one between the check and the connect
//     (DNS rebinding);
//   - redirects are followed by hand, at most 3, and each hop is checked
//     the same way.
import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';

const V4_BLOCKED = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

const v4ToInt = (ip) => ip.split('.').reduce((a, o) => ((a << 8) | Number(o)) >>> 0, 0);

function v4Blocked(ip) {
  const x = v4ToInt(ip);
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((x & mask) >>> 0) === ((v4ToInt(base) & mask) >>> 0);
  });
}

function expandV6(ip) {
  let s = ip.toLowerCase().split('%')[0];
  if (s.includes('.')) {
    // trailing dotted quad (::ffff:1.2.3.4)
    const i = s.lastIndexOf(':');
    const q = s.slice(i + 1).split('.').map(Number);
    s = `${s.slice(0, i)}:${((q[0] << 8) | q[1]).toString(16)}:${((q[2] << 8) | q[3]).toString(16)}`;
  }
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : [];
  const fill = tail !== undefined ? Array(8 - h.length - t.length).fill('0') : [];
  return [...h, ...fill, ...t].map((g) => parseInt(g || '0', 16));
}

function v6Blocked(ip) {
  const g = expandV6(ip);
  if (g.length !== 8 || g.some((x) => Number.isNaN(x))) return true;
  const allZero = (a, b) => g.slice(a, b).every((x) => x === 0);
  if (allZero(0, 8)) return true;                                   // ::
  if (allZero(0, 7) && g[7] === 1) return true;                     // ::1
  if (allZero(0, 5) && g[5] === 0xffff) {                           // ::ffff:a.b.c.d (IPv4-mapped)
    return v4Blocked(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
  }
  if (g[0] === 0x64 && g[1] === 0xff9b && allZero(2, 6)) {          // 64:ff9b::/96 NAT64
    return v4Blocked(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
  }
  if ((g[0] & 0xfe00) === 0xfc00) return true;                      // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true;                      // fe80::/10 link local
  if ((g[0] & 0xff00) === 0xff00) return true;                      // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;              // documentation
  return false;
}

/** True when an IP address must never be fetched from the worker. */
export function isBlockedAddress(ip) {
  const fam = net.isIP(ip);
  if (fam === 4) return v4Blocked(ip);
  if (fam === 6) return v6Blocked(ip);
  return true; // not an address at all: refuse
}

/** Checks a URL's shape. Returns an error message, or null when acceptable. */
export function urlProblem(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return 'That is not a web address.'; }
  if (u.protocol !== 'https:') return 'Only https links can be imported.';
  if (u.username || u.password) return 'Links with a user name or password in them cannot be imported.';
  if (u.port && u.port !== '443') return 'Links to a non-standard port cannot be imported.';
  if (!u.hostname) return 'That link has no host.';
  return null;
}

/**
 * Resolve a host and return one vetted public address, or throw. A literal
 * IP is vetted as is; a name must resolve only to public addresses (one
 * private answer refuses the whole name).
 */
export async function vetHost(hostname, { lookup = (h) => dns.lookup(h, { all: true, verbatim: true }) } = {}) {
  const bare = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(bare)) {
    if (isBlockedAddress(bare)) throw new Error('That link points to a private or reserved address.');
    return { address: bare, family: net.isIP(bare) };
  }
  const answers = await lookup(bare);
  if (!answers?.length) throw new Error('That link\'s host could not be found.');
  if (answers.some((a) => isBlockedAddress(a.address))) throw new Error('That link points to a private or reserved address.');
  return answers[0];
}

/**
 * GET a vetted URL with the connection pinned to the vetted address. Resolves
 * the final response (a Node IncomingMessage stream) after at most
 * maxRedirects redirects, each hop vetted again.
 */
export async function guardedGet(rawUrl, { maxRedirects = 3, lookup, request = https.request, timeoutMs = 60000 } = {}) {
  let url = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const problem = urlProblem(url);
    if (problem) throw new Error(problem);
    const u = new URL(url);
    const vetted = await vetHost(u.hostname, lookup ? { lookup } : undefined);
    // eslint-disable-next-line no-await-in-loop
    const res = await new Promise((resolve, reject) => {
      const req = request(u, {
        method: 'GET',
        // pin: whatever the resolver says later, connect to the vetted address
        lookup: (_h, opts, cb) => (opts && opts.all ? cb(null, [vetted]) : cb(null, vetted.address, vetted.family)),
        headers: { 'User-Agent': 'Petrolord-SeismicWorker/1', Accept: '*/*' },
        timeout: timeoutMs,
      }, resolve);
      req.on('timeout', () => req.destroy(new Error('The link did not answer in time.')));
      req.on('error', reject);
      req.end();
    });
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
      res.resume();
      url = new URL(res.headers.location, url).toString();
      continue;
    }
    return { res, finalUrl: url };
  }
  throw new Error(`The link redirected more than ${maxRedirects} times.`);
}
