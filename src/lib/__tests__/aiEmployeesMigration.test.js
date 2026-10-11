/**
 * @jest-environment node
 */
// The ai_employees migration: three ai_ tables, RLS on, super admins only
// (the existing is_super_admin() helper), anon gets nothing, the action log
// is append-only, the seed row is the YouTube channel manager in shadow
// mode, and there is no transaction wrapper (no nested commit).
import fs from 'fs';
import path from 'path';

const sql = fs.readFileSync(path.join(__dirname, '../../../supabase/migrations/20261011120000_ai_employees.sql'), 'utf8');
const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const TABLES = ['ai_employees', 'ai_employee_tasks', 'ai_employee_actions'];

test('three ai_ tables with RLS on, created idempotently', () => {
  for (const t of TABLES) {
    expect(code).toMatch(new RegExp(`create table if not exists public\\.${t} \\(`));
    expect(code).toMatch(new RegExp(`alter table public\\.${t} enable row level security`));
    expect(code).toMatch(new RegExp(`revoke all on public\\.${t} from anon, authenticated`));
  }
  const policies = code.match(/create policy (\w+)/g) || [];
  const drops = code.match(/drop policy if exists (\w+)/g) || [];
  expect(policies.length).toBe(drops.length);
});

test('every policy is super-admin only and to authenticated (negative control: nothing for anon)', () => {
  const blocks = code.split(/create policy /).slice(1);
  expect(blocks.length).toBe(8);
  for (const b of blocks) {
    const body = b.split(';')[0];
    expect(body).toMatch(/to authenticated/);
    expect(body).toMatch(/public\.is_super_admin\(\)/);
    expect(body).not.toMatch(/\banon\b/);
  }
  expect(code).not.toMatch(/grant [^;]*to anon/);
  expect(code).not.toMatch(/\bto public\s*[;,]/);
});

test('the action log is append-only: no update or delete policy or grant', () => {
  const actionPolicies = code.split(/create policy /).slice(1).map((b) => b.split(';')[0]).filter((b) => b.includes('on public.ai_employee_actions'));
  expect(actionPolicies.length).toBe(2);
  for (const b of actionPolicies) expect(b.split(';')[0]).not.toMatch(/for (update|delete|all)/);
  expect(code).toMatch(/grant select, insert on public\.ai_employee_actions to authenticated/);
  expect(code).not.toMatch(/grant [^;]*(update|delete)[^;]*ai_employee_actions/);
  expect(code).not.toMatch(/for delete/);
});

test('statuses, autonomy steps and the review rule are constrained', () => {
  expect(code).toMatch(/autonomy_step between 1 and 4/);
  expect(code).toMatch(/status in \('active', 'paused', 'retired'\)/);
  expect(code).toMatch(/status in \('proposed', 'approved', 'rejected', 'done', 'failed'\)/);
  expect(code).toMatch(/status = 'proposed' or \(reviewer_email is not null and reviewed_at is not null\)/);
});

test('seeds the YouTube channel manager at step 1, active, review in 30 days, idempotently', () => {
  expect(code).toMatch(/'youtube-channel-manager'/);
  expect(code).toMatch(/'ayoasaolu@lordswayenergy\.com',\s*'seyiojo@lordswayenergy\.com',\s*1,\s*'active',\s*now\(\),\s*now\(\) \+ interval '30 days'/);
  expect(code).toMatch(/on conflict \(slug\) do nothing/);
});

test('no transaction wrapper and no shared table touched', () => {
  expect(code).not.toMatch(/^\s*(begin|commit|rollback)\s*;/im);
  expect(code).not.toMatch(/alter table public\.(organizations|users|organization_members|invitations|profiles)/);
});
