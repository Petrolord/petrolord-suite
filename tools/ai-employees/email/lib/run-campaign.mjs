// One approved email_campaign task: resolve the audience to Brevo lists,
// create the campaign scheduled at its slot, and record the outcome. Split
// out of execute.mjs so tests drive it with mocked Brevo and database clients.
// Idempotent: a task that already has a campaign id is skipped; a campaign
// this worker made for the task (its name carries the task id) is adopted
// instead of made twice; a create that started and never finished is held
// until a person checks Brevo and reruns with --force.
import { executeBlocker, resolveAudience, campaignBody, campaignName, sendTime } from './campaign.mjs';

export async function runCampaignTask({ task, employee, db, brevo, config, dryRun = false, force = false, now = Date.now(), log = console.log }) {
  const blocker = executeBlocker({ task, employee, now });
  if (blocker) { log(`skip ${task?.id}: ${blocker}`); return { skipped: blocker }; }
  const p = task.payload;

  if (dryRun) {
    let lists = 'unresolved (no Brevo call in a dry run)';
    if (brevo) {
      try { lists = resolveAudience(p.audience, { config, lists: await brevo.listLists() }).join(', '); } catch (e) { lists = `WOULD FAIL: ${e.message}`; }
    }
    log(`[dry run] ${task.id} ${p.key}: would create "${p.subject}" for ${p.audience.join(' + ')} (lists ${lists}), scheduled ${sendTime(p.scheduled_at, now)}`);
    return { dryRun: true };
  }

  const prior = await db.actions(employee.id, task.id);
  // the last create-related entry says whether a create began and was never settled
  const last = prior.filter((a) => ['campaign_create_started', 'campaign_scheduled', 'campaign_blocked'].includes(a.action)).pop();
  const name = campaignName(task);
  const existing = (await brevo.listCampaigns()).find((c) => c.name === name);
  if (last?.action === 'campaign_create_started' && !existing && !force) {
    log(`skip ${task.id}: an earlier create started and never finished. Check Brevo campaigns for "${name}", then rerun with --force.`);
    return { skipped: 'unfinished earlier create' };
  }

  let listIds;
  try {
    listIds = resolveAudience(p.audience, { config, lists: await brevo.listLists() });
  } catch (e) {
    // a configuration gap, not a failed send: the task stays approved for the next run
    await db.logAction({ employee_id: employee.id, task_id: task.id, action: 'campaign_blocked', detail: { error: e.message } });
    log(`hold ${task.id}: ${e.message}`);
    return { skipped: e.message };
  }

  const scheduledAt = sendTime(p.scheduled_at, now);
  const result = { key: p.key, list_ids: listIds, scheduled_at: scheduledAt, started_at: new Date(now).toISOString() };
  try {
    let id = existing?.id;
    if (id) {
      result.adopted = true;
      log(`found campaign ${id} for ${task.id} already in Brevo; recording it.`);
    } else {
      await db.logAction({ employee_id: employee.id, task_id: task.id, action: 'campaign_create_started', detail: { key: p.key, list_ids: listIds } });
      id = (await brevo.createCampaign(campaignBody(task, { listIds, scheduledAt }))).id;
    }
    result.brevo_campaign_id = id;
    result.status = 'scheduled';
    result.completed_at = new Date().toISOString();
    await db.updateTask(task.id, { status: 'done', result }, { fromStatus: 'approved' });
    await db.logAction({ employee_id: employee.id, task_id: task.id, action: 'campaign_scheduled', detail: { brevo_campaign_id: id, scheduled_at: scheduledAt, list_ids: listIds } });
    log(`scheduled ${p.key}: Brevo campaign ${id} at ${scheduledAt} to lists ${listIds.join(', ')}`);
    return { campaignId: id };
  } catch (e) {
    if (e.status === 401) {
      // key or IP allowlist: Brevo made nothing, so the task stays approved for the next run
      await db.logAction({ employee_id: employee.id, task_id: task.id, action: 'campaign_blocked', detail: { error: e.message } });
      log(`hold ${task.id}: ${e.message}`);
      return { skipped: e.message };
    }
    result.error = e.message;
    result.completed_at = new Date().toISOString();
    await db.updateTask(task.id, { status: 'failed', result }, { fromStatus: 'approved' });
    await db.logAction({ employee_id: employee.id, task_id: task.id, action: 'task_failed', detail: { error: e.message } });
    log(`failed ${p.key}: ${e.message}`);
    return { error: e.message };
  }
}
