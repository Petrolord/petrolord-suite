// Campaign stats into task results. Read-only on Brevo.
import { campaignStats } from './brevo.mjs';

export const UNSUBSCRIBE_ALERT = 0.005; // 0.5% of delivered: the register's threshold

export async function reportTasks({ tasks, db, brevo, dry = false, now = new Date(), log = console.log }) {
  const out = [];
  for (const t of tasks || []) {
    const id = t.result?.brevo_campaign_id;
    if (!id) continue;
    const stats = campaignStats(await brevo.getCampaign(id));
    const alert = stats.unsubscribe_rate != null && stats.unsubscribe_rate > UNSUBSCRIBE_ALERT;
    log(`${t.payload?.key || t.id}: ${stats.status}, delivered ${stats.delivered}, opens ${stats.opens}, clicks ${stats.clicks}, unsubscribes ${stats.unsubscribes}, bounces ${stats.bounces}${alert ? '  UNSUBSCRIBES ABOVE 0.5%: tell the manager' : ''}`);
    out.push({ id: t.id, stats });
    if (!dry) await db.updateTask(t.id, { result: { ...t.result, stats, stats_at: now.toISOString(), unsubscribe_alert: alert } }, { fromStatus: 'done' });
  }
  return out;
}
