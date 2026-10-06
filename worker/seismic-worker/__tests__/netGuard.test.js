/**
 * @jest-environment node
 */
// Import-from-a-link fetch guard (QI programme Q0b-3): no private, loopback,
// link-local, carrier NAT, metadata, multicast or reserved address can be
// reached, in any of the forms an attacker would try, and the connection is
// pinned to the address that was checked.
import { EventEmitter } from 'node:events';
import { isBlockedAddress, urlProblem, vetHost, guardedGet } from '../src/netGuard.js';

describe('isBlockedAddress', () => {
  test.each([
    '127.0.0.1', '127.255.0.9', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '192.0.2.10', '198.18.0.1',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.1.2.3',
    '::ffff:169.254.169.254', '64:ff9b::a9fe:a9fe', '2001:db8::1', 'not-an-ip',
  ])('blocks %s', (ip) => expect(isBlockedAddress(ip)).toBe(true));

  test.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'allows public %s (negative control)', (ip) => expect(isBlockedAddress(ip)).toBe(false),
  );
});

describe('urlProblem', () => {
  test('https on the default port only, no credentials', () => {
    expect(urlProblem('https://data.example.com/f3.sgy')).toBeNull();
    expect(urlProblem('http://data.example.com/f3.sgy')).toMatch(/Only https/);
    expect(urlProblem('https://user:pw@data.example.com/f.sgy')).toMatch(/user name or password/);
    expect(urlProblem('https://data.example.com:8443/f.sgy')).toMatch(/non-standard port/);
    expect(urlProblem('ftp://x/y')).toMatch(/Only https/);
    expect(urlProblem('not a url')).toMatch(/not a web address/);
  });
});

describe('vetHost', () => {
  test('a name with any private answer is refused, a public one passes', async () => {
    await expect(vetHost('evil.example', { lookup: async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.2', family: 4 }] }))
      .rejects.toThrow(/private or reserved/);
    expect(await vetHost('good.example', { lookup: async () => [{ address: '93.184.216.34', family: 4 }] })).toEqual({ address: '93.184.216.34', family: 4 });
  });
  test('literal addresses are vetted as given, including bracketed IPv6', async () => {
    await expect(vetHost('169.254.169.254')).rejects.toThrow(/private/);
    await expect(vetHost('[::1]')).rejects.toThrow(/private/);
  });
});

function fakeRequest(routes, seen) {
  return (u, opts, onRes) => {
    const req = new EventEmitter();
    req.end = () => {
      opts.lookup(u.hostname, {}, (err, address) => { seen.push({ host: u.hostname, connectedTo: address }); });
      const r = routes[u.toString()];
      const res = new EventEmitter();
      Object.assign(res, { statusCode: r.status, headers: r.headers || {}, resume() {} });
      setImmediate(() => onRes(res));
    };
    req.destroy = () => {};
    return req;
  };
}

describe('guardedGet', () => {
  const lookup = async (h) => (h === 'cdn.example' ? [{ address: '93.184.216.34', family: 4 }] : h === 'internal.example' ? [{ address: '10.0.0.7', family: 4 }] : [{ address: '151.101.1.1', family: 4 }]);

  test('connects to the vetted address and follows a public redirect', async () => {
    const seen = [];
    const routes = {
      'https://data.example/f.sgy': { status: 302, headers: { location: 'https://cdn.example/real.sgy' } },
      'https://cdn.example/real.sgy': { status: 200 },
    };
    const { res, finalUrl } = await guardedGet('https://data.example/f.sgy', { lookup, request: fakeRequest(routes, seen) });
    expect(res.statusCode).toBe(200);
    expect(finalUrl).toBe('https://cdn.example/real.sgy');
    expect(seen).toEqual([{ host: 'data.example', connectedTo: '151.101.1.1' }, { host: 'cdn.example', connectedTo: '93.184.216.34' }]);
  });

  test('a redirect into a private network is refused', async () => {
    const routes = { 'https://data.example/f.sgy': { status: 302, headers: { location: 'https://internal.example/secret' } } };
    await expect(guardedGet('https://data.example/f.sgy', { lookup, request: fakeRequest(routes, []) })).rejects.toThrow(/private or reserved/);
  });

  test('a redirect to http or to the metadata address is refused', async () => {
    const r1 = { 'https://data.example/a': { status: 301, headers: { location: 'http://data.example/b' } } };
    await expect(guardedGet('https://data.example/a', { lookup, request: fakeRequest(r1, []) })).rejects.toThrow(/Only https/);
    const r2 = { 'https://data.example/a': { status: 307, headers: { location: 'https://169.254.169.254/latest/meta-data' } } };
    await expect(guardedGet('https://data.example/a', { lookup, request: fakeRequest(r2, []) })).rejects.toThrow(/private/);
  });

  test('redirect loops stop after 3 hops', async () => {
    const routes = { 'https://data.example/a': { status: 302, headers: { location: 'https://data.example/a' } } };
    await expect(guardedGet('https://data.example/a', { lookup, request: fakeRequest(routes, []) })).rejects.toThrow(/more than 3 times/);
  });
});
