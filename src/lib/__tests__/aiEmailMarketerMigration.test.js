/**
 * @jest-environment node
 */
// The email marketer migration seeds one register row, changes no
// constraint (the kind check already accepts email_campaign), touches no
// shared table and has no transaction lines. Its rollback deletes only that row.
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '../../..');
const strip = (s) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const code = strip(fs.readFileSync(path.join(root, 'supabase/migrations/20261017120000_ai_email_marketer.sql'), 'utf8'));
const base = strip(fs.readFileSync(path.join(root, 'supabase/migrations/20261011120000_ai_employees.sql'), 'utf8'));
const rollback = strip(fs.readFileSync(path.join(root, 'tools/security/ai-employees/rollback/20261017120000.rollback.sql'), 'utf8'));

test('seeds email-marketer at step 1, active, managers, review in 30 days, idempotently', () => {
  expect(code).toMatch(/insert into public\.ai_employees/);
  expect(code).toMatch(/'email-marketer'/);
  expect(code).toMatch(/'ayoasaolu@lordswayenergy\.com',\s*'seyiojo@lordswayenergy\.com',\s*1,\s*'active',\s*now\(\),\s*now\(\) \+ interval '30 days'/);
  expect(code).toMatch(/on conflict \(slug\) do nothing/);
});

test('the existing kind check already accepts the three email kinds, so nothing is widened', () => {
  const m = base.match(/constraint ai_employee_tasks_kind check \(kind ~ '([^']+)'\)/);
  const re = new RegExp(m[1]);
  for (const k of ['email_campaign', 'email_newsletter', 'email_onboarding']) expect(re.test(k)).toBe(true);
  expect(code).not.toMatch(/alter table|drop constraint|add constraint/i);
});

test('no transaction lines, no shared table, rollback deletes only the row', () => {
  expect(code).not.toMatch(/^\s*(begin|commit|rollback)\s*;/im);
  expect(code).not.toMatch(/public\.(organizations|users|organization_members|invitations|profiles)\b/);
  expect(rollback.trim()).toBe("delete from public.ai_employees where slug = 'email-marketer';");
});
