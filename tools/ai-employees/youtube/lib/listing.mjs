// Pure helpers for the YouTube channel manager: the public allowlist, the
// copy rules, and turning a finished video folder's text files into a
// youtube_listing proposal. No file system or network here; the CLI
// scripts read the files and pass their contents in. Unit tested in
// __tests__/listing.test.js.

export const LIMITS = Object.freeze({ title: 100, description: 5000, tagsTotal: 500 });
export const DEFAULT_PRIVACY = 'private'; // Google keeps API uploads private until the API project passes its audit
export const DEFAULT_LANGUAGE = 'en-GB';

/** The allowlist entry for a key, or null when the key is members-only. */
export function seriesFor(allowlist, key) {
  for (const s of allowlist?.series || []) {
    if ((s.keys || []).includes(key)) return s;
  }
  return null;
}

export function isPublicKey(allowlist, key) {
  return seriesFor(allowlist, key) !== null;
}

export function publicKeys(allowlist) {
  return (allowlist?.series || []).flatMap((s) => s.keys || []);
}

/** Copy problems in user-facing text: em dashes, spaced en dashes, angle brackets. */
export function copyIssues(text) {
  const s = String(text || '');
  const issues = [];
  if (s.includes('\u2014')) issues.push('em dash');
  if (/\s\u2013\s/.test(s)) issues.push('spaced en dash used as a dash');
  if (/\s--\s/.test(s)) issues.push('double hyphen used as a dash');
  if (/[<>]/.test(s)) issues.push('angle brackets (YouTube rejects them in descriptions)');
  return issues;
}

/** "0:00 Introduction" lines from chapters.txt to [{t, label}]. */
export function parseChapters(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim().match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/))
    .filter(Boolean)
    .map((m) => ({ t: m[1], label: m[2].trim() }));
}

/**
 * youtube-description.txt as written by the demo-video kit: the title on
 * the first line, a blank line, the body, and optionally a "Tags:" line.
 */
export function parseDescriptionFile(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const title = (lines.shift() || '').trim();
  let tags = [];
  const body = [];
  for (const l of lines) {
    const m = l.match(/^Tags:\s*(.*)$/i);
    if (m) tags = m[1].split(',').map((t) => t.trim()).filter(Boolean);
    else body.push(l);
  }
  return { title, body: body.join('\n').trim(), tags };
}

const LINK_LINE = /^(Petrolord Suite|Petrolord|Continue in NextGen Academy|NextGen Academy):\s*https?:\/\/\S+\s*$/i;

/**
 * The final description. Rules: the petrolord.com link is the last line;
 * lesson videos carry a "Continue in NextGen Academy" line just above it;
 * the chapters block is present (YouTube reads chapters from it); no
 * angle brackets; within YouTube's length limit.
 */
export function buildDescription({ body, chapters = [], kind, links }) {
  const suite = links?.suite || 'https://petrolord.com';
  const nextgen = links?.nextgen || 'https://nextgen.petrolord.com';
  let text = String(body || '')
    .split('\n')
    .filter((l) => !LINK_LINE.test(l.trim()))
    .join('\n')
    .replace(/[<>]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (chapters.length && !/^Chapters\s*$/m.test(text)) {
    text += `\n\nChapters\n${chapters.map((c) => `${c.t} ${c.label}`).join('\n')}`;
  }
  const tail = [];
  if (kind === 'lesson') tail.push(`Continue in NextGen Academy: ${nextgen}`);
  tail.push(`Petrolord Suite: ${suite}`);
  const tailText = tail.join('\n');
  const room = LIMITS.description - tailText.length - 2;
  if (text.length > room) text = `${text.slice(0, room - 1).trimEnd()}…`;
  return `${text}\n\n${tailText}`;
}

/** Tags trimmed to YouTube's 500-character total (each tag plus a comma). */
export function fitTags(tags) {
  const out = [];
  let total = 0;
  for (const raw of tags || []) {
    const t = String(raw).replace(/[<>,]/g, '').trim();
    if (!t || out.includes(t)) continue;
    const cost = t.length + (t.includes(' ') ? 2 : 0) + (out.length ? 1 : 0);
    if (total + cost > LIMITS.tagsTotal) break;
    out.push(t);
    total += cost;
  }
  return out;
}

/**
 * A youtube_listing proposal for one video folder. files holds the text
 * of the folder's files ({ description, chapters, srt }) and which ones
 * exist. Throws for a members-only key: it must never be proposed.
 */
export function buildListing({ key, allowlist, files = {}, scheduledAt = null, sourceDir }) {
  const series = seriesFor(allowlist, key);
  if (!series) throw new Error(`${key} is members-only and is never proposed for YouTube.`);
  if (!files.hasVideo) throw new Error(`${key} has no youtube.mp4.`);

  const parsed = files.description ? parseDescriptionFile(files.description) : null;
  const fallback = allowlist.fallbackListings?.[key] || null;
  if (!parsed?.title && !fallback) throw new Error(`${key} has no youtube-description.txt and no fallback listing.`);

  const chapters = parseChapters(files.chapters);
  const title = (parsed?.title || fallback.title).trim();
  const description = buildDescription({ body: parsed?.body || fallback.summary, chapters, kind: series.kind, links: allowlist.links });
  const tags = fitTags([...(parsed?.tags?.length ? parsed.tags : fallback?.tags || []), 'Petrolord']);
  const warnings = [...copyIssues(title).map((i) => `title: ${i}`), ...copyIssues(description).map((i) => `description: ${i}`)];
  if (title.length > LIMITS.title) warnings.push(`title: ${title.length} characters, over YouTube's ${LIMITS.title}`);

  return {
    video_key: key,
    series: series.id,
    series_kind: series.kind,
    title,
    description,
    chapters,
    tags,
    playlist: series.playlist,
    category_id: series.categoryId || '28',
    privacy: DEFAULT_PRIVACY,
    scheduled_at: scheduledAt,
    made_for_kids: false,
    default_language: DEFAULT_LANGUAGE,
    source_dir: sourceDir || null,
    video_file: 'youtube.mp4',
    captions_file: files.hasSrt ? 'youtube.srt' : null,
    thumbnail_file: files.hasThumbnail ? 'thumbnail.png' : null,
    copy_warnings: warnings,
  };
}

/**
 * Proposed publish times: one every everyDays days at hourUtc, from start.
 * The reviewer sees them; while the API project is unaudited the upload is
 * private and the human publishes at that time in YouTube Studio.
 */
export function scheduleSlots(count, { start, everyDays = 2, hourUtc = 9 } = {}) {
  const base = new Date(start || Date.now());
  const first = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hourUtc));
  if (first.getTime() <= base.getTime()) first.setUTCDate(first.getUTCDate() + 1);
  return Array.from({ length: count }, (_, i) => new Date(first.getTime() + i * everyDays * 864e5).toISOString());
}

/** The videos.insert resource for an approved listing payload. */
// YouTube's default API quota is 10,000 units a day and one upload with
// captions and a playlist costs about 2,100, so a daily run takes only the
// tasks whose slot has come (or comes within leadHours), oldest slot first.
export const DAILY_UPLOAD_CAP = 3;
export function slotOf(task) {
  const t = Date.parse(task?.payload?.scheduled_at ?? task?.scheduled_at ?? '');
  return Number.isFinite(t) ? t : null;
}
export function dueTasks(tasks, { now = Date.now(), leadHours = 24, max = DAILY_UPLOAD_CAP } = {}) {
  const until = now + leadHours * 3600e3;
  return tasks
    .filter((t) => slotOf(t) != null && slotOf(t) <= until)
    .sort((a, b) => slotOf(a) - slotOf(b))
    .slice(0, max);
}

export function videoResource(payload) {
  return {
    snippet: {
      title: payload.title,
      description: payload.description,
      tags: payload.tags || [],
      categoryId: payload.category_id || '28',
      defaultLanguage: payload.default_language || DEFAULT_LANGUAGE,
      defaultAudioLanguage: payload.default_language || DEFAULT_LANGUAGE,
    },
    status: {
      privacyStatus: payload.privacy || DEFAULT_PRIVACY,
      selfDeclaredMadeForKids: Boolean(payload.made_for_kids),
      embeddable: true,
    },
  };
}

/** Why an approved task may not be executed, or null when it may. */
export function executeBlocker({ task, employee, allowlist }) {
  if (!employee) return 'employee not found';
  if (employee.status !== 'active') return `employee is ${employee.status}`;
  if (!task) return 'no task';
  if (task.status !== 'approved') return `task is ${task.status}, only approved tasks run`;
  if (!task.reviewer_email || !task.reviewed_at) return 'task has no reviewer on record';
  if (task.kind !== 'youtube_listing') return `kind ${task.kind} is not supported yet`;
  const key = task.payload?.video_key;
  if (!key || !isPublicKey(allowlist, key)) return `${key || 'video'} is not on the public allowlist`;
  return null;
}
