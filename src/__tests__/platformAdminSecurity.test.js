/**
 * Platform-admin source of truth security fix (2026-09-19).
 *
 * Platform super admin = a row in public.platform_admins. user_metadata,
 * public.users.is_super_admin, a body-supplied admin id and hard-coded email
 * lists are NOT authority anywhere. Behaviour is proven on a scratch Postgres
 * (tools/security/platform-admin/scratch/run.sh), by the prod dry-run probe,
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
const MIG_DIR = 'supabase/migrations';
const MIG = '20260919195000_security_platform_admin_source.sql';

// every edge function that makes a platform-admin decision
const GUARDED = [
  'admin-update-org-entitlements', 'admin-suspend-org', 'admin-delete-organization',
  'admin-grant-user-app-access', 'admin-create-user', 'send-invite', 'insert-geoscience-apps',
  'org-offboard', 'org-export', 'invite-employee', 'generate-quote', 'admin-cleanup-test-data',
  'accept-employee-invitation',
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

  it('the shared guard reads platform_admins and nothing user-controlled', () => {
    const src = code(read(`${FNS}/_shared/platform-admin.ts`));
    expect(src).toMatch(/from\('platform_admins'\)/);
    expect(src).not.toMatch(/from\('users'\)/);
    expect(src).not.toMatch(/user_metadata\??\./);
  });

  it('send-invite takes recipient, link and names from the database, not the body', () => {
    const src = read(`${FNS}/send-invite/index.ts`);
    expect(src).toMatch(/resolveSendableInvitation\(admin, caller\.id, body\)/);
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

describe('the migration', () => {
  const sql = read(`${MIG_DIR}/${MIG}`);
  const all = fs.readdirSync(path.join(ROOT, MIG_DIR)).filter((f) => f.endsWith('.sql')).sort();

  it('sorts after the #537 fix slot and before the held PS0 seed', () => {
    expect(MIG > '20260919190000_security_invitation_acceptance.sql').toBe(true);
    expect(MIG < '20260919200000_ps0_seed_process_safety_module.sql').toBe(true);
    const seed = all.indexOf('20260919200000_ps0_seed_process_safety_module.sql');
    if (seed > -1) expect(all.indexOf(MIG)).toBeLessThan(seed);
  });

  it('makes platform_admins server-only and points is_super_admin() at it', () => {
    expect(sql).toMatch(/create table if not exists public\.platform_admins/);
    expect(sql).toMatch(/alter table public\.platform_admins enable row level security/);
    expect(sql).toMatch(/revoke all on table public\.platform_admins from public, anon, authenticated/);
    expect(sql).not.toMatch(/create policy[^;]*on public\.platform_admins/i);
    expect(sql).toMatch(/create or replace function public\.is_super_admin\(\)[\s\S]*?from public\.platform_admins pa where pa\.user_id = auth\.uid\(\)/);
    // FORCE RLS would hide the table from the SECURITY DEFINER helper itself
    expect(sql).not.toMatch(/force row level security/);
  });

  it('seeds confirmed accounts only and refuses to leave the table empty', () => {
    expect(sql).toMatch(/email_confirmed_at is not null/);
    expect(sql).toMatch(/platform_admins is empty after the seed/);
  });

  it('locks public.users privileged columns', () => {
    expect(sql).toMatch(/revoke insert, update, delete, truncate, references, trigger on table public\.users from anon, authenticated/);
    expect(sql).toMatch(/grant update \(primary_app, last_accessed_app, app_preferences, updated_at\) on table public\.users to authenticated/);
    expect(sql).toMatch(/create trigger users_guard_privileged_columns\s+before insert or update on public\.users/);
    expect(sql).toMatch(/with check \(auth\.uid\(\) = id\)/);
  });

  it('seat RPCs no longer read users.is_super_admin', () => {
    const body = sql.slice(sql.indexOf('-- ---- D. seat RPCs'));
    expect(body).not.toMatch(/u\.is_super_admin is true/);
    expect((body.match(/or public\.is_super_admin\(\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('hides pending invitation rows from non-admin members', () => {
    expect(sql).toMatch(/create policy view_organization_members[\s\S]*<> 'invited'/);
  });

  it('is logged in MIGRATIONS.md as not applied, second-engineer review', () => {
    const row = read('MIGRATIONS.md').split('\n').find((l) => l.includes(MIG));
    expect(row).toMatch(/NOT APPLIED/);
    expect(row).toMatch(/SECOND ENGINEER REVIEW REQUIRED/);
  });

  it('ships its owner tooling', () => {
    ['apply.sh', 'verify.sql', 'dryrun-probe.sql', 'rollback.sql', 'scratch/run.sh', 'scratch/probes.expected']
      .forEach((f) => expect(fs.existsSync(path.join(ROOT, 'tools/security/platform-admin', f))).toBe(true));
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
