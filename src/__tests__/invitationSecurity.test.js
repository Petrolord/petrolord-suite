/**
 * Invitation acceptance security fix (2026-09-19).
 *
 * add_user_to_organization let anyone make any user an owner of any org;
 * handle_new_user trusted organization_id/role in signup metadata; the
 * invitations table was world-readable and world-writable; invite-employee
 * trusted a self-set is_super_admin flag. The behaviour is proven on a
 * scratch Postgres (tools/security/invitation-acceptance/scratch/run.sh) and
 * by the prod dry-run probe; these tests pin the source so a later edit
 * cannot quietly reopen a door.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const MIG = 'supabase/migrations';
const STOP = '20260919180000_security_stopgap_revoke_add_user_to_organization.sql';
const FIX = '20260919190000_security_invitation_acceptance.sql';

describe('migration order', () => {
  const all = fs.readdirSync(path.join(ROOT, MIG)).filter((f) => f.endsWith('.sql')).sort();

  it('both files exist and sort before the held PS0 seed', () => {
    const seed = all.indexOf('20260919200000_ps0_seed_process_safety_module.sql');
    expect(all.indexOf(STOP)).toBeGreaterThan(-1);
    expect(all.indexOf(FIX)).toBeGreaterThan(all.indexOf(STOP));
    if (seed > -1) expect(all.indexOf(FIX)).toBeLessThan(seed);
  });

  it('sort after PR #535 migration B (20260919170000)', () => {
    expect(STOP > '20260919170000_security_b_rls_client_used_tables.sql').toBe(true);
  });

  it('are logged in MIGRATIONS.md as not applied, second-engineer review', () => {
    const log = read('MIGRATIONS.md');
    const row = log.split('\n').find((l) => l.includes(FIX));
    expect(row).toMatch(/NOT APPLIED/);
    expect(row).toMatch(/SECOND ENGINEER REVIEW REQUIRED/);
    expect(log.split('\n').some((l) => l.includes(STOP) && /NOT APPLIED/.test(l))).toBe(true);
  });
});

describe('the stop-gap', () => {
  const sql = read(`${MIG}/${STOP}`);
  it('revokes client EXECUTE on add_user_to_organization and nothing else', () => {
    expect(sql).toMatch(/revoke execute on function public\.add_user_to_organization\(uuid, uuid, text\) from public, anon, authenticated/);
    expect(sql).not.toMatch(/create or replace|drop /i);
  });
});

describe('the fix', () => {
  const sql = read(`${MIG}/${FIX}`);
  const trigger = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.handle_new_user()'));

  it('closes add_user_to_organization to clients', () => {
    expect(sql).toMatch(/revoke execute on function public\.add_user_to_organization\(uuid, uuid, text\) from public, anon, authenticated/);
  });

  it('accept_invitation takes only a token and acts for auth.uid()', () => {
    expect(sql).toMatch(/create or replace function public\.accept_invitation\(p_token text\)/);
    expect(sql).toMatch(/v_uid\s+uuid := auth\.uid\(\)/);
    expect(sql).toMatch(/revoke all on function public\.accept_invitation\(text\) from public, anon;/);
  });

  it('the acceptance core is not callable by any API role', () => {
    expect(sql).toMatch(/revoke all on function public\.invitation_accept_internal\(text, uuid, text, text\) from public, anon, authenticated, service_role;/);
  });

  it('drops every USING (true) invitations policy and anon access', () => {
    for (const p of ['Public can view invitations', 'Public can update invitation by token', 'Users can update own invitations']) {
      expect(sql).toContain(`drop policy if exists "${p}" on public.invitations;`);
    }
    expect(sql).toContain('revoke all on table public.invitations from anon;');
    expect(sql).not.toMatch(/create policy[^;]*using \(true\)/i);
  });

  it('the signup trigger no longer reads a role from metadata and refuses a bare organization_id', () => {
    expect(trigger).not.toMatch(/raw_user_meta_data->>'role'/);
    expect(trigger).not.toMatch(/org_id\s*:=\s*\(NEW\.raw_user_meta_data->>'organization_id'\)::UUID/);
    expect(trigger).toMatch(/requires a valid invitation/);
    expect(trigger).toMatch(/invitation_accept_internal\(/);
  });

  it('enable_hse_for_organization acts for auth.uid() and anon loses it', () => {
    expect(sql).toMatch(/You can only enable HSE for your own organization/);
    expect(sql).toMatch(/revoke all on function public\.enable_hse_for_organization\(uuid\) from public, anon;/);
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
