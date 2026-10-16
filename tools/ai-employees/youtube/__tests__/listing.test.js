/**
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';
import {
  seriesFor, isPublicKey, publicKeys, copyIssues, parseDescriptionFile, buildDescription, buildListing,
  fitTags, scheduleSlots, videoResource, executeBlocker, LIMITS, dueTasks, DAILY_UPLOAD_CAP,
  shortParent, isShortKey, scheduleShorts, withParentUrl, thumbnailFile, thumbnailHint, PARENT_URL_TOKEN,
} from '../lib/listing.mjs';

const allowlist = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/public-allowlist.json'), 'utf8'));

const LESSON_DESC = `Loading Well Logs: LAS Files | Petrophysics with Petrolord, Lesson 1

What is inside a LAS file.

Follow along: https://github.com/Petrolord/petrolord-suite/releases/tag/ekene-demo-v2
Petrolord Suite: https://petrolord.com

Chapters
0:00 Introduction
0:05 Welcome

Tags: LAS file, well logs, petrophysics`;

describe('public allowlist (owner decisions 2026-10-11)', () => {
  test('exactly the approved series are public', () => {
    expect(publicKeys(allowlist).sort()).toEqual([
      'lesson-a1', 'lesson-a2', 'lesson-a3', 'lesson-a4',
      'lesson-qi-a1', 'lesson-qi-a2', 'lesson-qi-a3',
      'petro-01', 'petro-02', 'petro-03',
      'qi-01', 'qi-02', 'qi-03',
      'seis-01', 'seis-02', 'seis-03',
      // Round 2 (owner 2026-10-16): demos and Module A of eight more apps.
      ...['rcp', 'mbal', 'wds', 'epe', 'pps', 'em', 'wt', 'bf'].flatMap((a) => [`${a}-01`, `${a}-02`, `${a}-03`, `lesson-${a}-a1`, `lesson-${a}-a2`, `lesson-${a}-a3`]),
      'lesson-rcp-a4',
    ].sort());
    expect(seriesFor(allowlist, 'well-data-manager')).toBeNull();
    expect(allowlist.series.find((s) => s.id === 'well-data-manager')).toBeTruthy();
  });

  test('negative controls: later modules, QI Module B onwards and old takes are members-only', () => {
    for (const k of ['lesson-epe-b4', 'lesson-rcp-b5', 'lesson-bf-d12', 'lesson-b5', 'lesson-c8', 'lesson-f22', 'lesson-qi-b4', 'lesson-qi-c8', 'lesson-qi-f18', 'petro-01-v1', 'qi-smoke', 'smoke-home', 'anything-else']) {
      expect(isPublicKey(allowlist, k)).toBe(false);
    }
    for (const k of allowlist.membersOnly.keys) expect(isPublicKey(allowlist, k)).toBe(false);
  });

  test('lesson series carry the NextGen line; demos do not', () => {
    for (const k of ['lesson-a1', 'lesson-qi-a3']) expect(seriesFor(allowlist, k).kind).toBe('lesson');
    for (const k of ['petro-01', 'qi-01', 'seis-03']) expect(seriesFor(allowlist, k).kind).toBe('demo');
  });

  test('every public key without a description file has a fallback listing within limits and clean copy', () => {
    for (const [k, f] of Object.entries(allowlist.fallbackListings)) {
      expect(isPublicKey(allowlist, k)).toBe(true);
      expect(f.title.length).toBeLessThanOrEqual(LIMITS.title);
      expect(copyIssues(f.title + f.summary)).toEqual([]);
    }
  });

  test('the config itself has no em dashes', () => {
    expect(fs.readFileSync(path.join(__dirname, '../config/public-allowlist.json'), 'utf8')).not.toMatch(/\u2014/);
  });
});

describe('copy rules', () => {
  test('flags em dashes, spaced en dashes and angle brackets', () => {
    expect(copyIssues('Plain text, with commas.')).toEqual([]);
    expect(copyIssues('A \u2014 B')).toContain('em dash');
    expect(copyIssues('A \u2013 B')).toContain('spaced en dash used as a dash');
    expect(copyIssues('1\u20132 ok')).toEqual([]);
    expect(copyIssues('<b>')).toHaveLength(1);
  });

  test('lesson description ends with the NextGen line then petrolord.com', () => {
    const d = buildDescription({ body: parseDescriptionFile(LESSON_DESC).body, chapters: [], kind: 'lesson', links: allowlist.links });
    const lines = d.split('\n');
    expect(lines[lines.length - 1]).toBe('Petrolord Suite: https://petrolord.com');
    expect(lines[lines.length - 2]).toBe('Continue in NextGen Academy: https://nextgen.petrolord.com');
    expect(d.match(/https:\/\/petrolord\.com/g)).toHaveLength(1);
    expect(d).toMatch(/Chapters\n0:00 Introduction/);
    expect(d).not.toMatch(/^Tags:/m);
  });

  test('demo description ends with petrolord.com and has no NextGen line; chapters added when missing', () => {
    const d = buildDescription({ body: 'Summary.', chapters: [{ t: '0:00', label: 'Intro' }], kind: 'demo' });
    expect(d.endsWith('Petrolord Suite: https://petrolord.com')).toBe(true);
    expect(d).not.toMatch(/NextGen/);
    expect(d).toMatch(/Chapters\n0:00 Intro/);
  });

  test('long bodies are cut so the links survive within 5000 characters', () => {
    const d = buildDescription({ body: 'x'.repeat(6000), kind: 'lesson' });
    expect(d.length).toBeLessThanOrEqual(LIMITS.description);
    expect(d.endsWith('Petrolord Suite: https://petrolord.com')).toBe(true);
  });

  test('tags fit the 500-character budget and drop duplicates', () => {
    const t = fitTags(Array.from({ length: 80 }, (_, i) => `tag number ${i}`).concat(['tag number 1']));
    expect(t.join(',').length).toBeLessThanOrEqual(500);
    expect(new Set(t).size).toBe(t.length);
  });
});

describe('buildListing', () => {
  test('a lesson listing from the kit files: private, playlist, chapters, tags, captions flag', () => {
    const l = buildListing({ key: 'lesson-a1', allowlist, files: { hasVideo: true, hasSrt: false, description: LESSON_DESC, chapters: '0:00 Introduction\n0:05 Welcome' }, scheduledAt: '2026-10-20T09:00:00.000Z', sourceDir: '/root/demo-videos/lesson-a1' });
    expect(l.title).toBe('Loading Well Logs: LAS Files | Petrophysics with Petrolord, Lesson 1');
    expect(l.privacy).toBe('private');
    expect(l.playlist).toBe('Petrophysics with Petrolord');
    expect(l.category_id).toBe('27');
    expect(l.chapters).toEqual([{ t: '0:00', label: 'Introduction' }, { t: '0:05', label: 'Welcome' }]);
    expect(l.tags).toEqual(['LAS file', 'well logs', 'petrophysics', 'Petrolord']);
    expect(l.captions_file).toBeNull();
    expect(l.copy_warnings).toEqual([]);
    expect(l.description).toMatch(/Continue in NextGen Academy/);
  });

  test('a demo without a description file uses the fallback listing', () => {
    const l = buildListing({ key: 'petro-02', allowlist, files: { hasVideo: true, hasSrt: true, chapters: '0:00 Introduction' } });
    expect(l.title).toBe(allowlist.fallbackListings['petro-02'].title);
    expect(l.captions_file).toBe('youtube.srt');
    expect(l.description.endsWith('https://petrolord.com')).toBe(true);
    expect(l.description).not.toMatch(/NextGen/);
  });

  test('negative controls: members-only keys and missing videos are refused', () => {
    expect(() => buildListing({ key: 'lesson-qi-b4', allowlist, files: { hasVideo: true, description: LESSON_DESC } })).toThrow(/members-only/);
    expect(() => buildListing({ key: 'lesson-b5', allowlist, files: { hasVideo: true, description: LESSON_DESC } })).toThrow(/members-only/);
    expect(() => buildListing({ key: 'qi-01', allowlist, files: { hasVideo: false } })).toThrow(/youtube\.mp4/);
    expect(() => buildListing({ key: 'qi-01', allowlist, files: { hasVideo: true } })).toThrow(/no youtube-description/);
  });

  test('em dashes in the source are surfaced as copy warnings for the reviewer', () => {
    const l = buildListing({ key: 'qi-01', allowlist, files: { hasVideo: true, description: 'Title \u2014 here\n\nBody.' } });
    expect(l.copy_warnings.join(' ')).toMatch(/title: em dash/);
  });

  test('videoResource is private and not for kids', () => {
    const r = videoResource(buildListing({ key: 'petro-01', allowlist, files: { hasVideo: true } }));
    expect(r.status).toMatchObject({ privacyStatus: 'private', selfDeclaredMadeForKids: false });
    expect(r.snippet.defaultLanguage).toBe('en-GB');
  });
});

describe('schedule and execute gate', () => {
  test('slots are every N days at 09:00 UTC, starting after now', () => {
    expect(scheduleSlots(3, { start: '2026-10-20T10:00:00Z', everyDays: 2 })).toEqual(['2026-10-21T09:00:00.000Z', '2026-10-23T09:00:00.000Z', '2026-10-25T09:00:00.000Z']);
    expect(scheduleSlots(1, { start: '2026-10-20T08:00:00Z' })).toEqual(['2026-10-20T09:00:00.000Z']);
  });

  const ok = { status: 'approved', kind: 'youtube_listing', reviewer_email: 'a@b.co', reviewed_at: '2026-10-12T00:00:00Z', payload: { video_key: 'qi-01' } };
  test('an approved, reviewed, allowlisted task for an active employee may run', () => {
    expect(executeBlocker({ task: ok, employee: { status: 'active' }, allowlist })).toBeNull();
  });
  test('negative controls: paused employee, unapproved task, no reviewer, members-only key, other kinds', () => {
    expect(executeBlocker({ task: ok, employee: { status: 'paused' }, allowlist })).toMatch(/paused/);
    expect(executeBlocker({ task: { ...ok, status: 'proposed' }, employee: { status: 'active' }, allowlist })).toMatch(/only approved/);
    expect(executeBlocker({ task: { ...ok, reviewer_email: null }, employee: { status: 'active' }, allowlist })).toMatch(/reviewer/);
    expect(executeBlocker({ task: { ...ok, payload: { video_key: 'lesson-qi-b4' } }, employee: { status: 'active' }, allowlist })).toMatch(/allowlist/);
    expect(executeBlocker({ task: { ...ok, kind: 'comment_reply' }, employee: { status: 'active' }, allowlist })).toMatch(/not supported/);
  });
});

describe('dueTasks', () => {
  const at = (id, iso) => ({ id, payload: { scheduled_at: iso } });
  const now = Date.parse('2026-10-13T20:00:00Z');
  const tasks = [at('c', '2026-10-17T09:00:00Z'), at('a', '2026-10-13T09:00:00Z'), at('b', '2026-10-14T09:00:00Z'), { id: 'x', payload: {} }];
  it('takes slots that have come or come within the lead, oldest first', () => {
    expect(dueTasks(tasks, { now, leadHours: 24 }).map((t) => t.id)).toEqual(['a', 'b']);
    expect(dueTasks(tasks, { now, leadHours: 0 }).map((t) => t.id)).toEqual(['a']);
  });
  it('never takes a task without a slot, and caps a run for the daily quota', () => {
    const many = Array.from({ length: 10 }, (_, i) => at(`t${i}`, `2026-10-0${(i % 9) + 1}T09:00:00Z`));
    expect(dueTasks(many, { now }).length).toBe(DAILY_UPLOAD_CAP);
    expect(dueTasks([{ id: 'x', payload: {} }], { now })).toEqual([]);
  });
});

// A small allowlist for the Short rules, independent of the live config.
const MINI = {
  links: allowlist.links,
  series: [
    { id: 'qi-demos', kind: 'demo', playlist: 'QI Studio', keys: ['qi-01', 'qi-02'] },
    { id: 'qi-lessons-module-a', kind: 'lesson', playlist: 'QI with Petrolord', keys: ['lesson-qi-a1'] },
    { id: 'demo-shorts', kind: 'short', playlist: null, categoryId: '28', keys: ['qi-01-short1', 'lesson-qi-a1-short1', 'lesson-qi-b4-short1', 'qi-09-short1', 'qi-02'] },
    { id: 'sneaky', kind: 'demo', playlist: 'x', keys: ['qi-02-short1'] },
  ],
};

const SHORT_DESC = `Can the seismic see a thin oil column? | QI Studio #Shorts

Can the seismic see a thin oil column?

A clip from the QI Studio demo "Does the Seismic See the Oil?".
Full demo: ${PARENT_URL_TOKEN}

Tags: AVO, Shorts, Petrolord Suite`;

describe('Shorts on the allowlist', () => {
  test('shortParent reads <parent>-short<n> and nothing else', () => {
    expect(shortParent('qi-01-short2')).toBe('qi-01');
    expect(shortParent('qi-01')).toBeNull();
    expect(shortParent('qi-01-shortcut')).toBeNull();
  });

  test('a listed Short of a public demo is public and is a Short', () => {
    expect(isPublicKey(MINI, 'qi-01-short1')).toBe(true);
    expect(isShortKey(MINI, 'qi-01-short1')).toBe(true);
    expect(isShortKey(MINI, 'qi-01')).toBe(false);
  });

  test('negative controls: a Short of a members-only lesson is never public, even when listed', () => {
    expect(isPublicKey(MINI, 'lesson-qi-b4-short1')).toBe(false);
    // public lessons do not get Shorts either: Shorts come from demos only
    expect(isPublicKey(MINI, 'lesson-qi-a1-short1')).toBe(false);
    // a parent that is not on the allowlist at all
    expect(isPublicKey(MINI, 'qi-09-short1')).toBe(false);
    // a Short listed outside a Short series, and a demo key listed inside one
    expect(isPublicKey(MINI, 'qi-02-short1')).toBe(false);
    expect(seriesFor(MINI, 'qi-02').kind).toBe('demo');
    // an unlisted Short of a public demo
    expect(isPublicKey(MINI, 'qi-01-short9')).toBe(false);
    expect(publicKeys(MINI)).toEqual(['qi-01', 'qi-02', 'lesson-qi-a1', 'qi-01-short1']);
    expect(() => buildListing({ key: 'lesson-qi-b4-short1', allowlist: MINI, files: { hasVideo: true, description: SHORT_DESC } })).toThrow(/members-only/);
  });

  test('every Short on the live allowlist is cut from a public demo', () => {
    for (const s of allowlist.series.filter((x) => x.kind === 'short')) {
      for (const k of s.keys) {
        expect([k, isPublicKey(allowlist, k)]).toEqual([k, true]);
        expect(seriesFor(allowlist, shortParent(k)).kind).toBe('demo');
      }
    }
  });
});

describe('Short listings', () => {
  test('format short: parent named, no chapters, no captions file, no custom thumbnail, parent link kept as a placeholder', () => {
    const l = buildListing({ key: 'qi-01-short1', allowlist: MINI, files: { hasVideo: true, hasSrt: true, hasThumbnailJpg: true, description: SHORT_DESC, chapters: '0:00 Intro\n0:10 More' } });
    expect(l).toMatchObject({ format: 'short', parent_key: 'qi-01', series_kind: 'short', captions_file: null, thumbnail_file: null, chapters: [], playlist: null });
    expect(l.title).toBe('Can the seismic see a thin oil column? | QI Studio #Shorts');
    expect(l.description).toContain(`Full demo: ${PARENT_URL_TOKEN}`);
    expect(l.description).not.toMatch(/Chapters|NextGen/);
    expect(l.description.endsWith('Petrolord Suite: https://petrolord.com')).toBe(true);
    expect(l.copy_warnings).toEqual([]);
  });

  test('the parent link is filled in when the parent is already uploaded', () => {
    const l = buildListing({ key: 'qi-01-short1', allowlist: MINI, files: { hasVideo: true, description: SHORT_DESC }, parentVideoId: 'abc123' });
    expect(l.description).toContain('Full demo: https://www.youtube.com/watch?v=abc123');
    expect(l.description).not.toContain(PARENT_URL_TOKEN);
  });

  test('negative control: a Short without the parent link is refused', () => {
    expect(() => buildListing({ key: 'qi-01-short1', allowlist: MINI, files: { hasVideo: true, description: 'T\n\nNo link here.' } })).toThrow(/link its parent/);
  });

  test('withParentUrl: filled, waiting (null), or untouched text without the token', () => {
    expect(withParentUrl(`a ${PARENT_URL_TOKEN} b`, 'X')).toBe('a https://www.youtube.com/watch?v=X b');
    expect(withParentUrl(`a ${PARENT_URL_TOKEN}`, null)).toBeNull();
    expect(withParentUrl('plain', null)).toBe('plain');
  });
});

describe('thumbnails', () => {
  test('thumbnail.jpg is preferred, thumbnail.png still works, none gives null', () => {
    expect(thumbnailFile({ hasThumbnailJpg: true, hasThumbnailPng: true })).toBe('thumbnail.jpg');
    expect(thumbnailFile({ hasThumbnailPng: true })).toBe('thumbnail.png');
    expect(thumbnailFile({ hasThumbnail: true })).toBe('thumbnail.png');
    expect(thumbnailFile({})).toBeNull();
    const l = buildListing({ key: 'qi-01', allowlist, files: { hasVideo: true, hasThumbnailJpg: true, description: 'T\n\nB.' } });
    expect(l.thumbnail_file).toBe('thumbnail.jpg');
  });
  test('a refused thumbnail points the owner at channel verification', () => {
    expect(thumbnailHint('YouTube POST /upload/youtube/v3/thumbnails/set failed (403): The authenticated user doesnt have permissions to upload and set custom video thumbnails.')).toMatch(/verify the phone number/);
    expect(thumbnailHint('failed (500): backend')).toMatch(/Rerun set-thumbnails/);
  });
  test('privacy is one of private, unlisted or public', () => {
    expect(buildListing({ key: 'qi-01', allowlist, files: { hasVideo: true, description: 'T\n\nB.' }, privacy: 'public' }).privacy).toBe('public');
    expect(() => buildListing({ key: 'qi-01', allowlist, files: { hasVideo: true, description: 'T\n\nB.' }, privacy: 'everyone' })).toThrow(/privacy/);
  });
});

describe('scheduling Shorts between the main uploads', () => {
  const parents = { 'qi-01': '2026-10-21T09:00:00.000Z', 'qi-02': '2026-10-23T09:00:00.000Z', 'seis-01': '2026-10-21T09:00:00.000Z' };
  test('a day after the parent, two days apart, never before start, oldest parent first', () => {
    const { slots, waiting } = scheduleShorts(['qi-02-short1', 'qi-01-short1', 'qi-01-short2', 'seis-01-short1'], parents, { start: '2026-10-20T10:00:00Z' });
    expect(slots).toEqual({
      'qi-01-short1': '2026-10-22T09:00:00.000Z',
      'qi-01-short2': '2026-10-24T09:00:00.000Z',
      'seis-01-short1': '2026-10-26T09:00:00.000Z',
      'qi-02-short1': '2026-10-28T09:00:00.000Z',
    });
    expect(waiting).toEqual([]);
    // with mains every two days from the 21st, no Short shares a day with a main upload
    for (const t of Object.values(slots)) expect(Object.values(parents)).not.toContain(t);
  });
  test('a parent uploaded long ago does not pull a Short into the past; a second run keeps the spacing', () => {
    const { slots } = scheduleShorts(['petro-01-short1'], { 'petro-01': '2026-10-13T09:00:00.000Z' }, { start: '2026-10-20T10:00:00Z', lastSlot: '2026-10-24T09:00:00.000Z' });
    expect(slots['petro-01-short1']).toBe('2026-10-26T09:00:00.000Z');
  });
  test('negative control: a Short whose parent has no slot waits', () => {
    const { slots, waiting } = scheduleShorts(['bf-01-short1'], parents, { start: '2026-10-20T10:00:00Z' });
    expect(slots).toEqual({});
    expect(waiting).toEqual(['bf-01-short1']);
  });
});

describe('execute gate for Shorts', () => {
  const base = { status: 'approved', kind: 'youtube_listing', reviewer_email: 'a@b.co', reviewed_at: '2026-10-12T00:00:00Z' };
  const short = { ...base, payload: { video_key: 'qi-01-short1', format: 'short', parent_key: 'qi-01', description: `x ${PARENT_URL_TOKEN}` } };
  test('a Short waits for its parent upload, then may run', () => {
    expect(executeBlocker({ task: short, employee: { status: 'active' }, allowlist: MINI })).toMatch(/waits for its parent qi-01/);
    expect(executeBlocker({ task: short, employee: { status: 'active' }, allowlist: MINI, parentVideoId: 'vid' })).toBeNull();
    // a description already carrying the URL needs nothing more
    expect(executeBlocker({ task: { ...short, payload: { ...short.payload, description: 'linked' } }, employee: { status: 'active' }, allowlist: MINI })).toBeNull();
  });
  test('negative controls: wrong parent, a members-only Short, a non-Short dressed as one', () => {
    expect(executeBlocker({ task: { ...short, payload: { ...short.payload, parent_key: 'qi-02' } }, employee: { status: 'active' }, allowlist: MINI, parentVideoId: 'v' })).toMatch(/wrong parent/);
    expect(executeBlocker({ task: { ...short, payload: { ...short.payload, video_key: 'lesson-qi-b4-short1', parent_key: 'lesson-qi-b4' } }, employee: { status: 'active' }, allowlist: MINI, parentVideoId: 'v' })).toMatch(/allowlist/);
    expect(executeBlocker({ task: { ...base, payload: { video_key: 'qi-01', format: 'short' } }, employee: { status: 'active' }, allowlist: MINI })).toMatch(/not a listed Short/);
  });
});
