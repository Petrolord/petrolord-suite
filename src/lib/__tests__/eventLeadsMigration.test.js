/**
 * @jest-environment node
 */
// The event_leads migration: visitors insert only, with consent and length
// checks; reads and deletes are for platform super admins (the existing
// is_super_admin() helper); no update path; no shared table touched.
import fs from 'fs';
import path from 'path';

const sql = fs.readFileSync(path.join(__dirname, '../../../supabase/migrations/20261010150000_event_leads.sql'), 'utf8');
const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

test('visitors may insert, only with consent', () => {
  expect(code).toMatch(/create policy event_leads_insert_visitors[\s\S]*?for insert to anon, authenticated[\s\S]*?with check \(consent\)/);
  expect(code).toMatch(/check \(consent\)/);
  expect(code).toMatch(/grant insert on public\.event_leads to anon, authenticated/);
});

test('only super admins read or delete; anon gets no read grant and nobody gets update (negative controls)', () => {
  expect(code).toMatch(/for select to authenticated\s+using \(public\.is_super_admin\(\)\)/);
  expect(code).toMatch(/for delete to authenticated\s+using \(public\.is_super_admin\(\)\)/);
  expect(code).not.toMatch(/for select to anon/);
  expect(code).not.toMatch(/for update/);
  expect(code).not.toMatch(/grant [^;]*select[^;]*to anon/);
  expect(code).not.toMatch(/grant [^;]*update/);
  expect(code).toMatch(/revoke all on public\.event_leads from anon, authenticated/);
});

test('lengths and formats are bounded, RLS is on, and no shared table is altered', () => {
  for (const c of ['name_len', 'phone_fmt', 'email_len', 'company_len', 'role_len', 'note_len', 'interests_len', 'source', 'ua_len']) expect(code).toMatch(new RegExp(`event_leads_${c}`));
  expect(code).toMatch(/enable row level security/);
  expect(code).not.toMatch(/alter table public\.(organizations|users|organization_members|invitations)/);
  expect(code).not.toMatch(/^\s*(begin|commit);/m);
});
