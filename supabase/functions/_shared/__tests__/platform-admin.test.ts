// Security fix 2026-09-19, refreshed 2026-10-14: platform super admin =
// public.is_super_admin() answering true for the CALLER's own session,
// nothing else. These tests drive the shared edge function guards with mocked
// Supabase clients and a mocked fetch standing in for PostgREST:
// user_metadata, app_metadata, JWT-ish claims, a users.is_super_admin flag, a
// body-supplied admin id and an email must all grant NOTHING; only the RPC,
// run with the caller's verified JWT, can.

import {
  bearerToken, getCaller, isPlatformAdmin, isOrgAdmin, isOrgMember, requirePlatformAdmin,
  decideInvitationAcceptance, escapeHtml, isServiceRoleRequest, safeEqual, callerCanSeeRow,
} from '../platform-admin.ts';
import { buildInternalMail } from '../internal-mail.ts';
import { resolveSendableInvitation, inviteOrigin, DEFAULT_INVITE_ORIGIN } from '../invite-send.ts';

type Row = Record<string, unknown>;

// PostgREST stand-in: /rest/v1/rpc/is_super_admin answers true only for the
// bearer tokens listed in RPC_ADMIN_JWTS. Anything else answers false, and
// RPC_MODE can force an HTTP error or a thrown network error.
const RPC_ADMIN_JWTS = new Set<string>(['jwt-admin']);
let RPC_MODE: 'ok' | 'http-error' | 'throw' | 'non-boolean' = 'ok';
const rpcCalls: Array<{ url: string; auth: string; apikey: string }> = [];
beforeAll(() => {
  process.env.SUPABASE_URL = 'https://proj.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
});
beforeEach(() => {
  RPC_MODE = 'ok';
  rpcCalls.length = 0;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).fetch = jest.fn(async (url: string, init: { headers: Record<string, string> }) => {
    const auth = init.headers.Authorization;
    rpcCalls.push({ url, auth, apikey: init.headers.apikey });
    if (RPC_MODE === 'throw') throw new Error('network down');
    if (RPC_MODE === 'http-error') return { ok: false, status: 404, json: async () => ({ message: 'not found' }) };
    if (RPC_MODE === 'non-boolean') return { ok: true, status: 200, json: async () => 'true' };
    const jwt = auth.replace(/^Bearer\s+/, '');
    return { ok: true, status: 200, json: async () => RPC_ADMIN_JWTS.has(jwt) };
  });
});


// A tiny stand-in for the service-role supabase-js client: tables are arrays
// of rows; select().eq()...maybeSingle() and awaiting the builder both work.
// Anything a test did not seed (e.g. 'users') is visible, to prove the code
// under test never consults it.
function mockAdmin(opts: {
  tables?: Record<string, Row[]>;
  users?: Record<string, Row>;        // jwt -> auth user
  failTables?: string[];              // tables whose queries return an error
} = {}) {
  const calls: string[] = [];
  const from = (table: string) => {
    calls.push(table);
    const filters: Array<[string, unknown]> = [];
    const run = () => {
      if (opts.failTables?.includes(table)) return { data: null, error: { message: `relation "${table}" does not exist` } };
      const rows = (opts.tables?.[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
      return { data: rows, error: null };
    };
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return b; },
      maybeSingle: async () => {
        const r = run();
        if (r.error) return r;
        return { data: (r.data as Row[])[0] ?? null, error: null };
      },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  };
  return {
    calls,
    from,
    auth: {
      getUser: async (jwt: string) => {
        const u = opts.users?.[jwt];
        return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } };
      },
    },
  };
}

const req = (auth?: string, origin?: string) => ({
  headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? auth ?? null : n.toLowerCase() === 'origin' ? origin ?? null : null) },
});

const ADMIN = { id: 'admin-1', email: 'info@petrolord.com', email_confirmed_at: '2025-10-14' };
// every user-controlled "I am an admin" signal at once
const FAKER = {
  id: 'faker-1', email: 'ayoasaolu@gmail.com.evil.test', email_confirmed_at: '2026-09-19',
  user_metadata: { is_super_admin: true, role: 'super_admin' },
  app_metadata: { is_super_admin: true, role: 'super_admin' },
  is_super_admin: true, role: 'super_admin', user_role: 'admin',
};

describe('bearerToken / getCaller', () => {
  test('parses a bearer token, ignores anything else', () => {
    expect(bearerToken(req('Bearer abc.def'))).toBe('abc.def');
    expect(bearerToken(req('bearer   xyz '))).toBe('xyz');
    expect(bearerToken(req('Basic abc'))).toBe('');
    expect(bearerToken(req())).toBe('');
  });
  test('only a token the auth server accepts is a caller', async () => {
    const admin = mockAdmin({ users: { 'jwt-admin': ADMIN } });
    expect(await getCaller(admin, req('Bearer jwt-admin'))).toEqual({ ...ADMIN, jwt: 'jwt-admin' });
    expect(await getCaller(admin, req('Bearer anon-key'))).toBeNull();
    expect(await getCaller(admin, req())).toBeNull();
  });
});

describe('isPlatformAdmin: is_super_admin() for the caller session is the only source', () => {
  test('the RPC runs as the caller (their JWT) and true makes an admin', async () => {
    const admin = mockAdmin();
    expect(await isPlatformAdmin(admin, { id: 'admin-1', jwt: 'jwt-admin' })).toBe(true);
    expect(rpcCalls).toEqual([{ url: 'https://proj.supabase.co/rest/v1/rpc/is_super_admin', auth: 'Bearer jwt-admin', apikey: 'anon-key' }]);
  });
  test('users.is_super_admin = true grants nothing, and users is never read', async () => {
    const admin = mockAdmin({ tables: { users: [{ id: 'faker-1', is_super_admin: true }] } });
    expect(await isPlatformAdmin(admin, { id: 'faker-1', jwt: 'jwt-faker' })).toBe(false);
    expect(admin.calls).not.toContain('users');
  });
  test('a bare user id (body-supplied) without a session token is never an admin', async () => {
    expect(await isPlatformAdmin(mockAdmin(), { id: 'admin-1' })).toBe(false);
    expect(await isPlatformAdmin(mockAdmin(), 'admin-1' as never)).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });
  test('fails closed: HTTP error, network error, non-boolean answer, no caller, no env', async () => {
    const c = { id: 'admin-1', jwt: 'jwt-admin' };
    RPC_MODE = 'http-error'; expect(await isPlatformAdmin(mockAdmin(), c)).toBe(false);
    RPC_MODE = 'throw'; expect(await isPlatformAdmin(mockAdmin(), c)).toBe(false);
    RPC_MODE = 'non-boolean'; expect(await isPlatformAdmin(mockAdmin(), c)).toBe(false);
    RPC_MODE = 'ok';
    expect(await isPlatformAdmin(mockAdmin(), null)).toBe(false);
    expect(await isPlatformAdmin(mockAdmin(), undefined)).toBe(false);
    const saved = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = '';
    expect(await isPlatformAdmin(mockAdmin(), c)).toBe(false);
    process.env.SUPABASE_URL = saved;
  });
});

describe('requirePlatformAdmin (admin-* functions, admin-create-user, insert-geoscience-apps)', () => {
  const tables = { users: [{ id: 'faker-1', is_super_admin: true }] };
  test('signed-out and anon-key callers get 401', async () => {
    const admin = mockAdmin({ tables, users: { 'jwt-admin': ADMIN } });
    expect(await requirePlatformAdmin(admin, req())).toMatchObject({ ok: false, status: 401 });
    expect(await requirePlatformAdmin(admin, req('Bearer anon-key'))).toMatchObject({ ok: false, status: 401 });
  });
  test('metadata, claims, users flag and look-alike email all get 403', async () => {
    const admin = mockAdmin({ tables, users: { 'jwt-faker': FAKER } });
    expect(await requirePlatformAdmin(admin, req('Bearer jwt-faker'))).toMatchObject({ ok: false, status: 403 });
  });
  test('an admin email whose session the RPC does not confirm gets 403 (email is not authority)', async () => {
    const admin = mockAdmin({ users: { 'jwt-lookalike': ADMIN } });
    expect(await requirePlatformAdmin(admin, req('Bearer jwt-lookalike'))).toMatchObject({ ok: false, status: 403 });
  });
  test('a real platform admin passes, and the audited id is the CALLER', async () => {
    const admin = mockAdmin({ tables, users: { 'jwt-admin': ADMIN } });
    const g = await requirePlatformAdmin(admin, req('Bearer jwt-admin'));
    expect(g).toEqual({ ok: true, caller: { ...ADMIN, jwt: 'jwt-admin' } });
  });
});

describe('isOrgAdmin', () => {
  const tables = { organization_members: [
    { organization_id: 'o1', user_id: 'u-owner', role: 'owner', status: 'active' },
    { organization_id: 'o1', user_id: 'u-viewer', role: 'viewer', status: 'active' },
    { organization_id: 'o1', user_id: 'u-gone', role: 'admin', status: 'removed' },
    { organization_id: 'o2', user_id: 'u-other', role: 'admin', status: 'active' },
  ] };
  test('active admin roles only, in that org only', async () => {
    const a = mockAdmin({ tables });
    expect(await isOrgAdmin(a, 'u-owner', 'o1')).toBe(true);
    expect(await isOrgAdmin(a, 'u-viewer', 'o1')).toBe(false);
    expect(await isOrgAdmin(a, 'u-gone', 'o1')).toBe(false);
    expect(await isOrgAdmin(a, 'u-other', 'o1')).toBe(false);
    expect(await isOrgAdmin(a, 'u-owner', null)).toBe(false);
  });
});

describe('decideInvitationAcceptance (accept-employee-invitation, existing accounts)', () => {
  const invitee = { id: 'u-invitee', email: 'Invitee@Example.com', email_confirmed_at: '2026-01-01' };
  test('existing account + no session: sign in required (the token alone no longer links)', () => {
    expect(decideInvitationAcceptance(true, null, 'invitee@example.com'))
      .toMatchObject({ kind: 'deny', status: 401, requires_sign_in: true });
  });
  test('existing account + a DIFFERENT signed-in user: refused', () => {
    const other = { id: 'u-other', email: 'viewer@example.com', email_confirmed_at: '2026-01-01' };
    expect(decideInvitationAcceptance(true, other, 'invitee@example.com'))
      .toMatchObject({ kind: 'deny', status: 403 });
  });
  test('existing account + session of the invited, confirmed email: link THAT user id', () => {
    expect(decideInvitationAcceptance(true, invitee, 'invitee@example.com')).toEqual({ kind: 'link', userId: 'u-invitee' });
  });
  test('an unconfirmed session email does not count', () => {
    expect(decideInvitationAcceptance(true, { ...invitee, email_confirmed_at: null }, 'invitee@example.com'))
      .toMatchObject({ kind: 'deny', status: 403 });
  });
  test('no account yet: the new-account path (password), whoever is signed in', () => {
    expect(decideInvitationAcceptance(false, null, 'new@example.com')).toEqual({ kind: 'new' });
    expect(decideInvitationAcceptance(false, { id: 'x', email: 'x@y.z', email_confirmed_at: 'now' }, 'new@example.com')).toEqual({ kind: 'new' });
  });
});

describe('send-invite: no longer a relay', () => {
  const tables = {
    invitations: [
      { id: 'inv-1', email: 'newhire@example.com', role: 'member', token: 'tok-1', org_id: 'o1', status: 'pending', first_name: '<b>Ann</b>' },
      { id: 'inv-2', email: 'old@example.com', role: 'member', token: 'tok-2', org_id: 'o1', status: 'accepted', first_name: null },
    ],
    organization_members: [
      { organization_id: 'o1', user_id: 'u-admin', role: 'admin', status: 'active' },
      { organization_id: 'o1', user_id: 'u-viewer', role: 'viewer', status: 'active' },
    ],
    organizations: [{ id: 'o1', name: 'Acme <script>' }],
  };
  test('signed out: 401', async () => {
    expect(await resolveSendableInvitation(mockAdmin({ tables }), null, { token: 'tok-1' })).toMatchObject({ ok: false, status: 401 });
  });
  test('must name an existing invitation; free-form recipients are impossible', async () => {
    const a = mockAdmin({ tables });
    expect(await resolveSendableInvitation(a, { id: 'u-admin', jwt: 'jwt-u-admin' }, { email: 'victim@example.com', inviteLink: 'https://evil.test' } as never))
      .toMatchObject({ ok: false, status: 400 });
    expect(await resolveSendableInvitation(a, { id: 'u-admin', jwt: 'jwt-u-admin' }, { token: 'nope' })).toMatchObject({ ok: false, status: 404 });
  });
  test('a non-admin member of the org, and a stranger, are refused', async () => {
    const a = mockAdmin({ tables });
    expect(await resolveSendableInvitation(a, { id: 'u-viewer', jwt: 'jwt-u-viewer' }, { token: 'tok-1' })).toMatchObject({ ok: false, status: 403 });
    expect(await resolveSendableInvitation(a, { id: 'u-stranger', jwt: 'jwt-u-stranger' }, { invite_id: 'inv-1' })).toMatchObject({ ok: false, status: 403 });
  });
  test('only pending invitations are sent', async () => {
    expect(await resolveSendableInvitation(mockAdmin({ tables }), { id: 'u-admin', jwt: 'jwt-u-admin' }, { token: 'tok-2' })).toMatchObject({ ok: false, status: 409 });
  });
  test('an org admin (or platform admin) gets the DATABASE recipient, role and org', async () => {
    const r = await resolveSendableInvitation(mockAdmin({ tables }), { id: 'u-admin', jwt: 'jwt-u-admin' }, { token: 'tok-1', email: 'victim@example.com' } as never);
    expect(r).toMatchObject({ ok: true, orgName: 'Acme <script>', invite: { email: 'newhire@example.com', token: 'tok-1', org_id: 'o1' } });
    expect(await resolveSendableInvitation(mockAdmin({ tables }), { id: 'admin-1', jwt: 'jwt-admin' }, { invite_id: 'inv-1' })).toMatchObject({ ok: true });
  });
  test('invite_id and token must agree', async () => {
    expect(await resolveSendableInvitation(mockAdmin({ tables }), { id: 'u-admin', jwt: 'jwt-u-admin' }, { invite_id: 'inv-1', token: 'tok-2' }))
      .toMatchObject({ ok: false, status: 404 });
  });
  test('link origin is allow-listed; values are escaped', () => {
    expect(inviteOrigin('https://hse.petrolord.com')).toBe('https://hse.petrolord.com');
    expect(inviteOrigin('https://evil.test')).toBe(DEFAULT_INVITE_ORIGIN);
    expect(inviteOrigin(null)).toBe(DEFAULT_INVITE_ORIGIN);
    expect(escapeHtml('Acme <script>"x"&\'')).toBe('Acme &lt;script&gt;&quot;x&quot;&amp;&#39;');
  });
});

describe('isOrgMember', () => {
  const tables = { organization_members: [
    { organization_id: 'o1', user_id: 'u-viewer', role: 'viewer', status: 'active' },
    { organization_id: 'o1', user_id: 'u-gone', role: 'admin', status: 'removed' },
  ] };
  test('any active role in that org; removed and other orgs are not members', async () => {
    const a = mockAdmin({ tables });
    expect(await isOrgMember(a, 'u-viewer', 'o1')).toBe(true);
    expect(await isOrgMember(a, 'u-gone', 'o1')).toBe(false);
    expect(await isOrgMember(a, 'u-viewer', 'o2')).toBe(false);
    expect(await isOrgMember(mockAdmin({ failTables: ['organization_members'] }), 'u-viewer', 'o1')).toBe(false);
  });
});

describe('isServiceRoleRequest (internal mail and notification functions)', () => {
  beforeAll(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-123'; });
  test('only the exact service-role key passes', () => {
    expect(isServiceRoleRequest(req('Bearer service-key-123'))).toBe(true);
    expect(isServiceRoleRequest(req('Bearer anon-key'))).toBe(false);
    expect(isServiceRoleRequest(req('Bearer service-key-1234'))).toBe(false);
    expect(isServiceRoleRequest(req('Bearer jwt-admin'))).toBe(false);
    expect(isServiceRoleRequest(req())).toBe(false);
  });
  test('fails closed when the key is not configured', () => {
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = '';
    expect(isServiceRoleRequest(req('Bearer '))).toBe(false);
    expect(isServiceRoleRequest(req('Bearer x'))).toBe(false);
    process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  });
  test('safeEqual', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('callerCanSeeRow (EPE engines): row-level security decides', () => {
  const RUN = '11111111-2222-4333-8444-555555555555';
  beforeEach(() => {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).fetch = jest.fn(async (url: string, init: { headers: Record<string, string> }) => {
      rpcCalls.push({ url, auth: init.headers.Authorization, apikey: init.headers.apikey });
      const visible = init.headers.Authorization === 'Bearer jwt-owner';
      return { ok: true, status: 200, json: async () => (visible ? [{ id: RUN }] : []) };
    });
  });
  test('asks PostgREST as the caller and trusts only a matching row', async () => {
    expect(await callerCanSeeRow({ id: 'u1', jwt: 'jwt-owner' }, 'epe_runs', RUN)).toBe(true);
    expect(rpcCalls[0].url).toBe(`https://proj.supabase.co/rest/v1/epe_runs?select=id&id=eq.${RUN}`);
    expect(await callerCanSeeRow({ id: 'u2', jwt: 'jwt-stranger' }, 'epe_runs', RUN)).toBe(false);
  });
  test('rejects odd table names, non-uuid ids and callers without a session', async () => {
    expect(await callerCanSeeRow({ id: 'u1', jwt: 'jwt-owner' }, 'epe_runs;drop', RUN)).toBe(false);
    expect(await callerCanSeeRow({ id: 'u1', jwt: 'jwt-owner' }, 'epe_runs', `${RUN}&or=(id.neq.0)`)).toBe(false);
    expect(await callerCanSeeRow({ id: 'u1' }, 'epe_runs', RUN)).toBe(false);
    expect(await callerCanSeeRow(null, 'epe_runs', RUN)).toBe(false);
  });
});

describe('buildInternalMail (send-email, send-email-via-smtp)', () => {
  test('one valid recipient, subject and html required', () => {
    expect(buildInternalMail({ to: 'a@b.co', subject: 'Hi', html: '<p>x</p>' })).toEqual({ to: 'a@b.co', subject: 'Hi', html: '<p>x</p>' });
    expect(typeof buildInternalMail({ to: 'a@b.co,c@d.co', subject: 'Hi', html: 'x' })).toBe('string');
    expect(typeof buildInternalMail({ to: ['a@b.co'] as never, subject: 'Hi', html: 'x' })).toBe('string');
    expect(typeof buildInternalMail({ to: 'a@b.co', html: 'x' })).toBe('string');
    expect(typeof buildInternalMail(null)).toBe('string');
  });
  test('subject header injection is flattened', () => {
    const m = buildInternalMail({ to: 'a@b.co', subject: 'Hi\r\nBcc: x@y.z', html: 'x' });
    expect(typeof m !== 'string' && m.subject).toBe('Hi Bcc: x@y.z');
  });
  test('the quote_created template escapes values and keeps only https links', () => {
    const m = buildInternalMail({ to: 'a@b.co', template: 'quote_created', details: {
      orgName: '<script>x</script>', numUsers: 3, term: 'annual', calculation: { final: 99 }, link: 'javascript:alert(1)' } });
    expect(typeof m).toBe('object');
    if (typeof m === 'string') return;
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).not.toContain('javascript:');
    const ok = buildInternalMail({ to: 'a@b.co', template: 'quote_created', details: { link: 'https://x.supabase.co/q.pdf' } });
    expect(typeof ok !== 'string' && ok.html).toContain('https://x.supabase.co/q.pdf');
  });
});
