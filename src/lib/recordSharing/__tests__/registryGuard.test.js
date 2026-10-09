// Every table an app hands to useSharedSavedProjects is registered with the
// sharing rules. QI Studio's was not (found 2026-10-09): the store threw
// "is not a shared record table" before any request, so after a project was
// created none of its edits was ever saved. This reads the source, so a new
// app cannot repeat it unnoticed.
import fs from 'fs';
import path from 'path';
import { SHARING_TABLES, tableSpec } from '../rules';

const SRC = path.join(__dirname, '../../..');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk(SRC).map((f) => ({ f, text: fs.readFileSync(f, 'utf8') }));
// the constant in the calling file first (many files have their own TABLE),
// then wherever it is exported from
const constantValue = (name, own) => {
  const re = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*['"]([a-z0-9_]+)['"]`);
  const mine = re.exec(own);
  if (mine) return mine[1];
  const exp = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*['"]([a-z0-9_]+)['"]`);
  for (const { text } of files) { const m = exp.exec(text); if (m) return m[1]; }
  return null;
};

test('every table given to the shared saved-projects hook is a registered shared record table', () => {
  const uses = [];
  for (const { f, text } of files) {
    for (const m of text.matchAll(/useSharedSavedProjects\(\{\s*table:\s*([A-Za-z_][A-Za-z0-9_]*|['"][a-z0-9_]+['"])/g)) {
      const raw = m[1];
      const table = /^['"]/.test(raw) ? raw.slice(1, -1) : constantValue(raw, text);
      uses.push({ file: path.relative(SRC, f), raw, table });
    }
  }
  expect(uses.length).toBeGreaterThanOrEqual(9);
  for (const u of uses) {
    expect({ ...u, resolved: !!u.table }).toEqual({ ...u, resolved: true });
    expect({ ...u, registered: !!SHARING_TABLES[u.table] }).toEqual({ ...u, registered: true });
  }
  expect(uses.map((u) => u.table)).toContain('saved_qi_studio_projects');
});

test('negative control: an unregistered table is refused, which is what QI Studio hit', () => {
  expect(() => tableSpec('saved_not_a_real_projects')).toThrow(/is not a shared record table/);
  expect(tableSpec('saved_qi_studio_projects').nameColumn).toBe('project_name');
});
