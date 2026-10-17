// Secrets for the email marketer, from the same root-only file the YouTube
// worker uses (/root/.ai-employees.env): SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY and BREVO_API_KEY. A file readable by group or
// others is refused; keys are never printed.
import fs from 'node:fs';
import { parseEnv, ENV_FILE } from '../../youtube/lib/supabase.mjs';

export { ENV_FILE };

export function loadBrevoKey(file = ENV_FILE) {
  if (!fs.existsSync(file)) throw new Error(`No ${file}. Create it (chmod 600) with BREVO_API_KEY=...`);
  if (fs.statSync(file).mode & 0o077) throw new Error(`${file} is readable by group or others. Run chmod 600 ${file}.`);
  const key = parseEnv(fs.readFileSync(file, 'utf8')).BREVO_API_KEY;
  if (!key) throw new Error(`${file} has no BREVO_API_KEY.`);
  return key;
}

/** Consenting NAPE leads with an email, read with the service role. */
export async function fetchLeads({ url, key, fetchImpl = fetch }, query) {
  const res = await fetchImpl(`${url}/rest/v1/${query}`, { headers: { apikey: key, authorization: `Bearer ${key}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase GET event_leads failed (${res.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}
