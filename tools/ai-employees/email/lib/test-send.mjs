// Proof sends to the managers only. Testable with mocked clients.
import { finalEmail, isEmailKind } from '../../../../src/lib/aiEmailDraft.js';
import { SENDER, REPLY_TO } from './templates.mjs';

export const MANAGERS = Object.freeze(['ayoasaolu@lordswayenergy.com', 'seyiojo@lordswayenergy.com']);

export async function testSend({ task, employee, db, brevo, to = MANAGERS, dry = false, log = console.log }) {
  if (!isEmailKind(task?.kind)) throw new Error(`Task ${task?.id} is not an email task.`);
  const bad = to.filter((e) => !MANAGERS.includes(e));
  if (!to.length || bad.length) throw new Error(`Test sends go to the managers only (${MANAGERS.join(', ')}). Refused: ${bad.join(', ') || 'no address'}.`);
  const f = finalEmail(task.payload);
  const name = `TEST AI ${task.payload?.key || 'email'} task ${task.id}`;
  if (dry) { log(`[dry run] would send "${f.subject}" to ${to.join(', ')} (draft campaign "${name}")${f.unfilled.length ? `; unfilled: ${f.unfilled.join(', ')}` : ''}`); return null; }
  const body = { name, subject: `[TEST] ${f.subject}`, previewText: f.preheader, sender: { ...SENDER }, replyTo: REPLY_TO, htmlContent: f.html };
  const existing = (await brevo.listCampaigns()).find((c) => c.name === name);
  let id = existing?.id;
  if (id) await brevo.updateCampaign(id, body);
  else id = (await brevo.createCampaign(body)).id; // a draft: no recipients, no scheduledAt
  await brevo.sendTest(id, to);
  await db.logAction({ employee_id: employee.id, task_id: task.id, action: 'test_sent', detail: { to, brevo_draft_id: id } });
  log(`test sent: "${f.subject}" to ${to.join(', ')} (Brevo draft ${id}).`);
  return id;
}
