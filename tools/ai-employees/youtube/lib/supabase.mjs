// Supabase access for the worker: PostgREST over fetch with the service-role
// key, read from a root-only env file. The key is never printed, and a file
// readable by group or others is refused.
import fs from 'node:fs';

export const ENV_FILE = '/root/.ai-employees.env';

export function parseEnv(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

export function loadServiceEnv(file = ENV_FILE) {
  if (!fs.existsSync(file)) return null;
  const mode = fs.statSync(file).mode & 0o077;
  if (mode) throw new Error(`${file} is readable by group or others. Run chmod 600 ${file}.`);
  const env = parseEnv(fs.readFileSync(file, 'utf8'));
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error(`${file} needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`);
  return { url: env.SUPABASE_URL.replace(/\/$/, ''), key: env.SUPABASE_SERVICE_ROLE_KEY };
}

export function createDb({ url, key, fetchImpl = fetch }) {
  const headers = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  async function req(method, path, body, prefer) {
    const res = await fetchImpl(`${url}/rest/v1/${path}`, {
      method,
      headers: prefer ? { ...headers, prefer } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]} failed (${res.status}): ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }
  return {
    async employee(slug) {
      const rows = await req('GET', `ai_employees?slug=eq.${encodeURIComponent(slug)}&select=*`);
      return rows?.[0] || null;
    },
    tasks(employeeId, { status, kind } = {}) {
      const f = [`employee_id=eq.${employeeId}`, status ? `status=eq.${status}` : null, kind ? `kind=eq.${kind}` : null, 'select=*', 'order=created_at.asc'].filter(Boolean);
      return req('GET', `ai_employee_tasks?${f.join('&')}`);
    },
    async insertTask(row) {
      const rows = await req('POST', 'ai_employee_tasks', row, 'return=representation');
      return rows?.[0];
    },
    async updateTask(id, patch, { fromStatus } = {}) {
      const guard = fromStatus ? `&status=eq.${fromStatus}` : '';
      const rows = await req('PATCH', `ai_employee_tasks?id=eq.${id}${guard}`, patch, 'return=representation');
      if (!rows?.length) throw new Error(`Task ${id} was not updated (its status changed underneath us).`);
      return rows[0];
    },
    logAction(row) {
      return req('POST', 'ai_employee_actions', row, 'return=minimal');
    },
    actions(employeeId, taskId) {
      return req('GET', `ai_employee_actions?employee_id=eq.${employeeId}&task_id=eq.${taskId}&select=*&order=created_at.asc`);
    },
  };
}
