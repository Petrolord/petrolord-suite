// AI employees (owner approved 2026-10-11). Pure helpers for the super-admin
// page at /admin/ai-employees: the autonomy steps, task status transitions,
// the review patch written when a human approves or rejects a proposal, a
// readable preview of a task payload, and the weekly scorecard.
// No Supabase or React here, so all of it is unit tested.
// Email tasks (the email marketer, 2026-10-17) use src/lib/aiEmailDraft.js.
import { isEmailKind, applyEmailEdits, emailPreview } from './aiEmailDraft.js';

export const AUTONOMY_STEPS = Object.freeze({
  1: { label: 'Shadow', detail: 'Proposes only. A human approves every item.' },
  2: { label: 'Draft and approve', detail: 'Drafts the work. A human approves before it goes out.' },
  3: { label: 'Act and audit', detail: 'Acts, and a human audits the log afterwards.' },
  4: { label: 'Autonomous within limits', detail: 'Acts alone inside agreed limits.' },
});

export const EMPLOYEE_STATUSES = Object.freeze(['active', 'paused', 'retired']);
export const TASK_STATUSES = Object.freeze(['proposed', 'approved', 'rejected', 'done', 'failed']);

// proposed -> approved | rejected (a human review); approved -> done | failed
// (the worker's outcome). rejected, done and failed are final.
const TRANSITIONS = Object.freeze({
  proposed: ['approved', 'rejected'],
  approved: ['done', 'failed'],
  rejected: [],
  done: [],
  failed: [],
});

export const LIMITS = Object.freeze({ title: 100, description: 5000, note: 1000 });

export function autonomyLabel(step) {
  const s = AUTONOMY_STEPS[Number(step)];
  return s ? `Step ${Number(step)}: ${s.label}` : `Step ${step}`;
}

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/** The status a Pause/Resume switch moves an employee to; retired stays put. */
export function toggledEmployeeStatus(status) {
  if (status === 'active') return 'paused';
  if (status === 'paused') return 'active';
  return status;
}

/**
 * The row patch for a human review. decision is 'approve' or 'reject'.
 * On approve the reviewer may edit the payload's title and description;
 * the edited values replace the proposal's and the task title follows.
 * Throws on a review that is not allowed, so the page never writes one.
 */
export function reviewPatch(task, { decision, note, reviewerEmail, edits, now = new Date() } = {}) {
  if (!task) throw new Error('No task to review.');
  const to = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : null;
  if (!to) throw new Error('Choose approve or reject.');
  if (!canTransition(task.status, to)) throw new Error(`A ${task.status} task cannot be ${to}.`);
  const email = String(reviewerEmail || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('A review needs the reviewer\'s email.');
  const cleanNote = String(note || '').trim().slice(0, LIMITS.note);

  const patch = {
    status: to,
    reviewer_email: email,
    review_note: cleanNote || null,
    reviewed_at: new Date(now).toISOString(),
  };

  if (to === 'approved' && edits && isEmailKind(task.kind)) {
    const payload = applyEmailEdits(task.payload, edits);
    if (payload) {
      patch.payload = payload;
      patch.title = payload.subject || task.title;
    }
  } else if (to === 'approved' && edits) {
    const payload = { ...(task.payload || {}) };
    let changed = false;
    if (typeof edits.title === 'string') {
      const t = edits.title.trim();
      if (!t) throw new Error('The title cannot be empty.');
      if (t.length > LIMITS.title) throw new Error(`YouTube titles are at most ${LIMITS.title} characters.`);
      if (t !== payload.title) { payload.title = t; changed = true; }
    }
    if (typeof edits.description === 'string') {
      const d = edits.description.replace(/\s+$/, '');
      if (d.length > LIMITS.description) throw new Error(`YouTube descriptions are at most ${LIMITS.description} characters.`);
      if (d !== payload.description) { payload.description = d; changed = true; }
    }
    if (changed) {
      payload.edited_by_reviewer = true;
      patch.payload = payload;
      patch.title = payload.title || task.title;
    }
  }
  return patch;
}

/** "0:00 Introduction" lines, or [{t, label}] objects, to [{t, label}]. */
export function parseChapters(chapters) {
  if (!chapters) return [];
  const list = Array.isArray(chapters) ? chapters : String(chapters).split('\n');
  return list
    .map((c) => {
      if (c && typeof c === 'object') return { t: String(c.t || c.time || ''), label: String(c.label || c.title || '') };
      const m = String(c).trim().match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/);
      return m ? { t: m[1], label: m[2].trim() } : null;
    })
    .filter((c) => c && c.t && c.label);
}

function fmtWhen(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** A youtube_listing payload normalised for display. */
export function listingPreview(payload = {}) {
  const p = payload || {};
  return {
    videoKey: p.video_key || null,
    title: p.title || '(no title)',
    description: p.description || '',
    chapters: parseChapters(p.chapters),
    tags: Array.isArray(p.tags) ? p.tags.filter(Boolean) : String(p.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    playlist: p.playlist || null,
    privacy: p.privacy || 'private',
    scheduledAt: p.scheduled_at || null,
    scheduledLabel: fmtWhen(p.scheduled_at) || 'Not scheduled',
    captions: Boolean(p.captions_file),
  };
}

/**
 * A task's preview: { kind: 'youtube_listing', listing } for listings,
 * { kind: 'email', email } for the email marketer's drafts, or
 * { kind: 'generic', fields: [[key, text]] } for anything else.
 */
export function taskPreview(task) {
  if (!task) return { kind: 'generic', fields: [] };
  if (task.kind === 'youtube_listing' || task.kind === 'youtube_upload') {
    return { kind: 'youtube_listing', listing: listingPreview(task.payload) };
  }
  if (isEmailKind(task.kind)) return { kind: 'email', email: emailPreview(task.payload) };
  const fields = Object.entries(task.payload || {}).map(([k, v]) => [
    k.replace(/_/g, ' '),
    v != null && typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v ?? ''),
  ]);
  return { kind: 'generic', fields };
}

/** Monday 00:00 UTC of the week containing now. */
export function weekStart(now = new Date()) {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

const inWeek = (iso, start) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < start.getTime() + 7 * 864e5;
};

/**
 * This week's scorecard (Monday to Sunday, UTC). proposed counts tasks
 * created this week; approved and rejected count reviews made this week
 * (an approved task that has since finished still counts as approved);
 * done counts tasks finished this week. rejectionRate is rejected over
 * reviewed, or null when nothing was reviewed.
 */
export function weeklyScorecard(tasks = [], now = new Date()) {
  const start = weekStart(now);
  let proposed = 0; let approved = 0; let rejected = 0; let done = 0;
  for (const t of tasks || []) {
    if (inWeek(t.created_at, start)) proposed += 1;
    if (inWeek(t.reviewed_at, start)) {
      if (t.status === 'rejected') rejected += 1;
      else if (['approved', 'done', 'failed'].includes(t.status)) approved += 1;
    }
    if (t.status === 'done' && inWeek(t.result?.completed_at || t.reviewed_at, start)) done += 1;
  }
  const reviewed = approved + rejected;
  return {
    weekStart: start.toISOString().slice(0, 10),
    proposed, approved, rejected, done,
    rejectionRate: reviewed ? rejected / reviewed : null,
  };
}

export function pct(rate) {
  return rate == null ? 'None reviewed' : `${Math.round(rate * 100)}%`;
}
