// Security fix 2026-09-19: platform super admin = a row in
// public.platform_admins, nothing else. These tests drive the shared edge
// function guards with mocked Supabase clients: user_metadata, app_metadata,
// JWT-ish claims, a users.is_super_admin flag, a body-supplied admin id and
// an email allow-list must all grant NOTHING; a platform_admins row must.

import {
  bearerToken, getCaller, isPlatformAdmin, isOrgAdmin, requirePlatformAdmin,
  decideInvitationAcceptance, escapeHtml,
} from '../platform-admin.ts';
import { resolveSendableInvitation, inviteOrigin, DEFAULT_INVITE_ORIGIN } from '../invite-send.ts';

type Row = Record<string, unknown>;

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
    expect(await getCaller(admin, req('Bearer jwt-admin'))).toEqual(ADMIN);
    expect(await getCaller(admin, req('Bearer anon-key'))).toBeNull();
    expect(await getCaller(admin, req())).toBeNull();
  });
});

describe('isPlatformAdmin: platform_admins is the only source', () => {
  test('a platform_admins row makes an admin', async () => {
    const admin = mockAdmin({ tables: { platform_admins: [{ user_id: 'admin-1' }] } });
    expect(await isPlatformAdmin(admin, 'admin-1')).toBe(true);
  });
  test('users.is_super_admin = true without a row grants nothing, and users is never read', async () => {
    const admin = mockAdmin({ tables: { platform_admins: [], users: [{ id: 'faker-1', is_super_admin: true }] } });
    expect(await isPlatformAdmin(admin, 'faker-1')).toBe(false);
    expect(admin.calls).not.toContain('users');
  });
  test('fails closed: missing table, query error, empty id', async () => {
    expect(await isPlatformAdmin(mockAdmin({ failTables: ['platform_admins'] }), 'admin-1')).toBe(false);
    expect(await isPlatformAdmin(mockAdmin({ tables: { platform_admins: [{ user_id: 'admin-1' }] } }), '')).toBe(false);
    expect(await isPlatformAdmin(mockAdmin({ tables: { platform_admins: [{ user_id: 'admin-1' }] } }), undefined)).toBe(false);
    const throwing = { from: () => { throw new Error('boom'); } };
    expect(await isPlatformAdmin(throwing, 'admin-1')).toBe(false);
  });
});

describe('requirePlatformAdmin (admin-* functions, admin-create-user, insert-geoscience-apps)', () => {
  const tables = { platform_admins: [{ user_id: 'admin-1' }], users: [{ id: 'faker-1', is_super_admin: true }] };
  test('signed-out and anon-key callers get 401', async () => {
    const admin = mockAdmin({ tables, users: { 'jwt-admin': ADMIN } });
    expect(await requirePlatformAdmin(admin, req())).toMatchObject({ ok: false, status: 401 });
    expect(await requirePlatformAdmin(admin, req('Bearer anon-key'))).toMatchObject({ ok: false, status: 401 });
  });
  test('metadata, claims, users flag and look-alike email all get 403', async () => {
    const admin = mockAdmin({ tables, users: { 'jwt-faker': FAKER } });
    expect(await requirePlatformAdmin(admin, req('Bearer jwt-faker'))).toMatchObject({ ok: false, status: 403 });
  });
  test('an allow-listed email with no platform_admins row gets 403 (email is not authority)', async () => {
    const admin = mockAdmin({ tables: { platform_admins: [] }, users: { 'jwt-admin': ADMIN } });
    expect(await requirePlatformAdmin(admin, req('Bearer jwt-admin'))).toMatchObject({ ok: false, status: 403 });
  });
  test('a real platform admin passes, and the audited id is the CALLER', async () => {
    const admin = mockAdmin({ tables, users: { 'jwt-admin': ADMIN } });
    const g = await requirePlatformAdmin(admin, req('Bearer jwt-admin'));
    expect(g).toEqual({ ok: true, caller: ADMIN });
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
    platform_admins: [{ user_id: 'admin-1' }],
  };
  test('signed out: 401', async () => {
    expect(await resolveSendableInvitation(mockAdmin({ tables }), null, { token: 'tok-1' })).toMatchObject({ ok: false, status: 401 });
  });
  test('must name an existing invitation; free-form recipients are impossible', async () => {
    const a = mockAdmin({ tables });
    expect(await resolveSendableInvitation(a, 'u-admin', { email: 'victim@example.com', inviteLink: 'https://evil.test' } as never))
      .toMatchObject({ ok: false, status: 400 });
    expect(await resolveSendableInvitation(a, 'u-admin', { token: 'nope' })).toMatchObject({ ok: false, status: 404 });
  });
  test('a non-admin member of the org, and a stranger, are refused', async () => {
    const a = mockAdmin({ tables });
    expect(await resolveSendableInvitation(a, 'u-viewer', { token: 'tok-1' })).toMatchObject({ ok: false, status: 403 });
    expect(await resolveSendableInvitation(a, 'u-stranger', { invite_id: 'inv-1' })).toMatchObject({ ok: false, status: 403 });
  });
  test('only pending invitations are sent', async () => {
    expect(await resolveSendableInvitation(mockAdmin({ tables }), 'u-admin', { token: 'tok-2' })).toMatchObject({ ok: false, status: 409 });
  });
  test('an org admin (or platform admin) gets the DATABASE recipient, role and org', async () => {
    const r = await resolveSendableInvitation(mockAdmin({ tables }), 'u-admin', { token: 'tok-1', email: 'victim@example.com' } as never);
    expect(r).toMatchObject({ ok: true, orgName: 'Acme <script>', invite: { email: 'newhire@example.com', token: 'tok-1', org_id: 'o1' } });
    expect(await resolveSendableInvitation(mockAdmin({ tables }), 'admin-1', { invite_id: 'inv-1' })).toMatchObject({ ok: true });
  });
  test('invite_id and token must agree', async () => {
    expect(await resolveSendableInvitation(mockAdmin({ tables }), 'u-admin', { invite_id: 'inv-1', token: 'tok-2' }))
      .toMatchObject({ ok: false, status: 404 });
  });
  test('link origin is allow-listed; values are escaped', () => {
    expect(inviteOrigin('https://hse.petrolord.com')).toBe('https://hse.petrolord.com');
    expect(inviteOrigin('https://evil.test')).toBe(DEFAULT_INVITE_ORIGIN);
    expect(inviteOrigin(null)).toBe(DEFAULT_INVITE_ORIGIN);
    expect(escapeHtml('Acme <script>"x"&\'')).toBe('Acme &lt;script&gt;&quot;x&quot;&amp;&#39;');
  });
});
