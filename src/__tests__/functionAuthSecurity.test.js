/**
 * Edge function and SPA auth source pins (security fixes 2026-09-19, refreshed 2026-10-14).
 *
 * Platform super admin = public.is_super_admin() for the caller's own session. user_metadata,
 * public.users.is_super_admin, a body-supplied admin id and hard-coded email
 * lists are NOT authority anywhere. Behaviour is proven by
 * the prod rollback probes (docs/security/RUNBOOK-2026-10.md)
 * and by supabase/functions/_shared/__tests__/platform-admin.test.ts (mocked
 * clients). These tests pin the source so a later edit cannot quietly
 * reopen a door.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
// code only: comments may (and do) name the old, untrusted signals
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const FNS = 'supabase/functions';
// every edge function that makes a platform-admin decision
const GUARDED = [
  'admin-update-org-entitlements', 'admin-suspend-org', 'admin-delete-organization',
  'admin-grant-user-app-access', 'admin-create-user', 'send-invite', 'insert-geoscience-apps',
  'org-offboard', 'org-export', 'invite-employee', 'generate-quote', 'admin-cleanup-test-data',
  'accept-employee-invitation',
  // 2026-10 sweep
  'get-app-seat-usage', 'remove-member-from-app', 'send-quote', 'invite-user',
  'send-email', 'send-email-via-smtp', 'send-renewal-notification', 'send-demo-request',
  'activate-bank-transfer', 'reject-bank-transfer', 'verify-bank-transfer',
  'process-subscription-renewals', 'epe-cash-flow-engine', 'epe-cash-flow-engine-batch',
];

const allFunctionSources = () => fs.readdirSync(path.join(ROOT, FNS), { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== '_shared')
  .flatMap((d) => fs.readdirSync(path.join(ROOT, FNS, d.name))
    .filter((f) => /\.(ts|js)$/.test(f))
    .map((f) => [`${FNS}/${d.name}/${f}`, code(read(`${FNS}/${d.name}/${f}`))]));

describe('edge functions: no user-controlled admin signal is authority', () => {
  const sources = allFunctionSources();

  it('nothing reads user_metadata / app_metadata is_super_admin', () => {
    const hits = sources.filter(([, s]) => /\.(user|app)_metadata\??\.is_super_admin/.test(s)).map(([f]) => f);
    expect(hits).toEqual([]);
  });

  it('nothing selects users.is_super_admin', () => {
    const hits = sources.filter(([, s]) => /select\(\s*['"`]is_super_admin['"`]\s*\)/.test(s)).map(([f]) => f);
    expect(hits).toEqual([]);
  });

  it('no SUPER_ADMIN_EMAILS allow-list decides anything', () => {
    const hits = sources.filter(([, s]) => /SUPER_ADMIN_EMAILS/.test(s)).map(([f]) => f);
    expect(hits).toEqual([]);
  });

  it('no admin id is taken from the request body', () => {
    const hits = sources.filter(([, s]) => /super_admin_id[^\n]*\}\s*=\s*await req\.json\(\)/.test(s)
      || /\.eq\(\s*['"]id['"]\s*,\s*super_admin_id\s*\)/.test(s)).map(([f]) => f);
    expect(hits).toEqual([]);
  });

  it.each(GUARDED)('%s uses the shared platform-admin guard', (fn) => {
    const src = read(`${FNS}/${fn}/index.ts`);
    expect(src).toMatch(/from ['"]\.\.\/_shared\/platform-admin\.ts['"]/);
  });

  it('the shared guard asks is_super_admin() with the caller JWT and reads nothing user-controlled', () => {
    const src = code(read(`${FNS}/_shared/platform-admin.ts`));
    expect(src).toMatch(/rest\/v1\/rpc\/is_super_admin/);
    expect(src).toMatch(/Authorization: `Bearer \$\{jwt\}`/);
    expect(src).not.toMatch(/from\('users'\)/);
    expect(src).not.toMatch(/user_metadata\??\./);
  });

  it('send-invite takes recipient, link and names from the database, not the body', () => {
    const src = read(`${FNS}/send-invite/index.ts`);
    expect(src).toMatch(/resolveSendableInvitation\(admin, caller, body\)/);
    expect(src).toMatch(/to: \[\{ email: invite\.email \}\]/);
    expect(src).not.toMatch(/body\.(inviteLink|orgName|inviterName|email)\b/);
    expect(src).not.toMatch(/const \{[^}]*inviteLink[^}]*\} = /);
    expect(src).not.toMatch(/maskedKey|substring\(0, 10\)/); // no API key fragments in logs
  });

  it('accept-employee-invitation links existing accounts only for a matching session', () => {
    const src = read(`${FNS}/accept-employee-invitation/index.ts`);
    expect(src).toMatch(/decideInvitationAcceptance\(!!existingUser\?\.id, caller, member\.email\)/);
    expect(src).toMatch(/user_id: decision\.userId/);
    expect(src).not.toMatch(/user_id: existingUser\.id/);
  });
});

describe('the Suite SPA asks the server who is a platform admin', () => {
  it('SupabaseAuthContext does not trust metadata or an email list', () => {
    const src = code(read('src/contexts/SupabaseAuthContext.jsx'));
    expect(src).toMatch(/supabase\.rpc\('is_super_admin'\)/);
    expect(src).not.toMatch(/userMetadata\.is_super_admin|user_metadata\??\.is_super_admin/);
    expect(src).not.toMatch(/hardcodedSuperAdminEmails/);
  });
});

describe('edge functions and client', () => {
  it('accept-employee-invitation sends the token and no longer deletes the invited row', () => {
    const fn = read('supabase/functions/accept-employee-invitation/index.ts');
    expect(fn).toMatch(/invitation_token: token/);
    expect(fn).not.toMatch(/\.delete\(\)/);
    expect(fn).toMatch(/\.eq\('status', 'invited'\)/);
  });

  it('invite-employee does not trust a self-set is_super_admin flag', () => {
    const fn = read('supabase/functions/invite-employee/index.ts');
    expect(fn).not.toMatch(/user_metadata\?\.is_super_admin/);
    expect(fn).not.toMatch(/select\('is_super_admin'\)/);
    expect(fn).toMatch(/super_admin role cannot be granted by invitation/);
  });

  it('the admin Org Team dialog uses invite-employee, not the unauthenticated legacy invite-user', () => {
    const src = read('src/components/admin/organizations/OrgTeam.jsx');
    expect(src).toMatch(/functions\.invoke\('invite-employee'/);
    expect(src).not.toMatch(/functions\.invoke\('invite-user'/);
  });
});

describe('2026-10 sweep: each function checks its caller the right way', () => {
  const src = (fn) => code(read(`${FNS}/${fn}/index.ts`));

  it.each(['send-email', 'send-email-via-smtp', 'send-renewal-notification'])(
    '%s serves only service-role callers (no open mail relay)', (fn) => {
      const s = src(fn);
      expect(s).toMatch(/isServiceRoleRequest\(req\)/);
      expect(s).not.toMatch(/sendgrid-send-email/);
    });

  it.each(['send-quote', 'activate-bank-transfer', 'reject-bank-transfer'])(
    '%s requires a platform super admin', (fn) => {
      expect(src(fn)).toMatch(/requirePlatformAdmin\(supabase, req\)/);
    });

  it('process-subscription-renewals: service role or platform admin only', () => {
    const s = src('process-subscription-renewals');
    expect(s).toMatch(/isServiceRoleRequest\(req\)/);
    expect(s).toMatch(/requirePlatformAdmin\(supabase, req\)/);
  });

  it('remove-member-from-app ignores requested_by and checks the org of the assignment', () => {
    const s = src('remove-member-from-app');
    expect(s).not.toMatch(/requested_by/);
    expect(s).not.toMatch(/organization_users/);
    expect(s).toMatch(/isOrgAdmin\(supabase, caller\.id, organization_id\)/);
    expect(s).toMatch(/\.eq\('organization_id', organization_id\)/);
  });

  it('get-app-seat-usage: members only, no auth user listing', () => {
    const s = src('get-app-seat-usage');
    expect(s).toMatch(/isOrgMember\(supabase, caller\.id, organization_id\)/);
    expect(s).not.toMatch(/listUsers/);
  });

  it('invite-user and verify-bank-transfer check the caller against the organization', () => {
    expect(src('invite-user')).toMatch(/isOrgAdmin\(supabaseClient, caller\.id, organization_id\)/);
    const v = src('verify-bank-transfer');
    expect(v).toMatch(/isOrgAdmin\(supabase, caller\.id, orgId\)/);
    expect(v).not.toMatch(/const \{[^}]*user_id[^}]*\} = await req\.json\(\)/);
  });

  it('generate-quote takes the user from the session, never the body', () => {
    const s = src('generate-quote');
    expect(s).toMatch(/const user_id = caller\.id;/);
    expect(s).not.toMatch(/const \{[^}]*\buser_id\b[^}]*\} = await req\.json\(\)/);
  });

  it.each(['epe-cash-flow-engine', 'epe-cash-flow-engine-batch'])(
    '%s checks the run is visible to the caller under RLS', (fn) => {
      expect(src(fn)).toMatch(/callerCanSeeRow\(caller, 'epe_runs', run_id\)/);
    });

  it('send-demo-request (public form) escapes what it echoes and rate-limits per address', () => {
    const s = src('send-demo-request');
    expect(s).toMatch(/escapeHtml\(full_name/);
    expect(s).toMatch(/escapeHtml\(company_name\)/);
    expect(s).toMatch(/PER_EMAIL_PER_DAY/);
  });
});
