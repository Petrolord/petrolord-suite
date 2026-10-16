/**
 * @jest-environment node
 */
// Housekept masters come back from R2 before an upload, and tasks proposed
// before thumbnails (#1176) still get the folder's thumbnail. Every client
// here is a mock: no R2, YouTube or database call leaves the test.
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runTask } from '../lib/run-task.mjs';
import { ensureLocal, resolveThumbnail, thumbnailCandidates, fileSource } from '../lib/masters.mjs';

const allowlist = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/public-allowlist.json'), 'utf8'));
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const VIDEO = Buffer.from('fake mp4 bytes for petro-03');
const THUMB = Buffer.from('fake jpeg bytes');

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'ytfix-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

/** A video folder after housekeeping: r2.json kept, chosen files deleted. */
function folder(key, { local = [], r2Files = { 'youtube.mp4': VIDEO, 'thumbnail.jpg': THUMB } } = {}) {
  const dir = path.join(root, key);
  fs.mkdirSync(dir);
  const files = {};
  for (const [name, buf] of Object.entries(r2Files)) files[name] = { key: `${key}/${name}`, size: buf.length, md5: md5(buf) };
  fs.writeFileSync(path.join(dir, 'r2.json'), JSON.stringify({ bucket: 'petrolord-videos', files }));
  for (const name of local) fs.writeFileSync(path.join(dir, name), name.endsWith('.mp4') ? VIDEO : THUMB);
  return dir;
}

/** Mock R2: serves objects by key, writing them where get() is told. */
function mockR2(objects) {
  return {
    cfg: { bucket: 'petrolord-videos' },
    get: jest.fn(async (_cfg, key, dest) => {
      if (!(key in objects)) throw new Error(`GET ${key}: 404`);
      fs.writeFileSync(dest, objects[key]);
      return objects[key].length;
    }),
  };
}

function mockDb() {
  return {
    actions: jest.fn(async () => []),
    logAction: jest.fn(async () => {}),
    updateTask: jest.fn(async () => {}),
  };
}

function mockYt() {
  return {
    videosInsert: jest.fn(async ({ filePath }) => {
      expect(fs.readFileSync(filePath)).toEqual(VIDEO); // the restored file is what goes up
      return { id: 'vidNEW', status: { privacyStatus: 'public' } };
    }),
    captionsInsert: jest.fn(async () => ({})),
    thumbnailsSet: jest.fn(async () => ({})),
    playlistsMine: jest.fn(async () => ({ items: [{ id: 'PL1', snippet: { title: 'Petrophysics with Petrolord: demos' } }] })),
    playlistsInsert: jest.fn(),
    playlistItemsInsert: jest.fn(async () => ({})),
  };
}

// an approved round-1 task as proposed before #1176: no thumbnail_file
const task = (dir, extra = {}) => ({
  id: 't-petro-03',
  kind: 'youtube_listing',
  status: 'approved',
  reviewer_email: 'owner@example.com',
  reviewed_at: '2026-10-15T10:00:00Z',
  payload: {
    video_key: 'petro-03', title: 'Petro demo 3', description: 'd', privacy: 'public', playlist: 'Petrophysics with Petrolord: demos',
    scheduled_at: '2026-10-17T09:00:00Z', source_dir: dir, video_file: 'youtube.mp4', captions_file: null, ...extra,
  },
});

const run = (t, deps) => runTask({ task: t, employee: { id: 'emp', status: 'active' }, allowlist, dryRun: false, force: false, playlists: new Map(), uploaded: new Map(), log: () => {}, ...deps });

beforeAll(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'error').mockImplementation(() => {}); jest.spyOn(process.stdout, 'write').mockImplementation(() => true); });
afterAll(() => jest.restoreAllMocks());

describe('housekept youtube.mp4 restored from R2', () => {
  test('missing locally, fetched from R2, verified, uploaded; housekeeping can free it again later', async () => {
    const dir = folder('petro-03', { local: ['thumbnail.jpg'] });
    const r2 = mockR2({ 'petro-03/youtube.mp4': VIDEO });
    const db = mockDb();
    const yt = mockYt();
    await run(task(dir), { r2, db, yt });
    expect(r2.get).toHaveBeenCalledWith(r2.cfg, 'petro-03/youtube.mp4', expect.stringMatching(/youtube\.mp4\.r2part$/));
    expect(yt.videosInsert).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(path.join(dir, 'youtube.mp4'))).toEqual(VIDEO);
    expect(fs.existsSync(path.join(dir, 'youtube.mp4.r2part'))).toBe(false);
    expect(db.logAction.mock.calls.map((c) => c[0].action)).toEqual(['master_restored', 'upload_started', 'video_uploaded', 'task_done']);
    expect(db.updateTask).toHaveBeenCalledWith('t-petro-03', expect.objectContaining({ status: 'done' }), { fromStatus: 'approved' });
  });

  test('an R2 copy whose MD5 does not match r2.json is never uploaded and the task fails', async () => {
    const dir = folder('petro-03', { local: ['thumbnail.jpg'] });
    const corrupt = Buffer.from(VIDEO); corrupt[0] ^= 0xff; // same size, different bytes
    const r2 = mockR2({ 'petro-03/youtube.mp4': corrupt });
    const db = mockDb();
    const yt = mockYt();
    await run(task(dir), { r2, db, yt });
    expect(yt.videosInsert).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(dir, 'youtube.mp4'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'youtube.mp4.r2part'))).toBe(false);
    const [, update] = db.updateTask.mock.calls[0];
    expect(update.status).toBe('failed');
    expect(update.result.error).toMatch(/MD5 .* but r2\.json says/);
    expect(db.logAction.mock.calls.map((c) => c[0].action)).toEqual(['task_failed']);
  });

  test('a size mismatch is refused too', async () => {
    const dir = folder('petro-03');
    const r2 = mockR2({ 'petro-03/youtube.mp4': Buffer.concat([VIDEO, Buffer.from('x')]) });
    await expect(ensureLocal(dir, 'youtube.mp4', { r2 })).rejects.toThrow(/bytes but r2\.json says/);
  });

  test('missing locally and in R2: the task fails with a clear message, no upload', async () => {
    const dir = folder('petro-03', { local: ['thumbnail.jpg'] });
    const r2 = mockR2({}); // the bucket answers 404
    const db = mockDb();
    const yt = mockYt();
    await run(task(dir), { r2, db, yt });
    expect(yt.videosInsert).not.toHaveBeenCalled();
    const [, update] = db.updateTask.mock.calls[0];
    expect(update.status).toBe('failed');
    expect(update.result.error).toMatch(/youtube\.mp4 is missing locally and the R2 fetch of petro-03\/youtube\.mp4 failed: GET petro-03\/youtube\.mp4: 404/);
  });

  test('missing locally with no r2.json record, or no R2 config: clear failures', async () => {
    const dir = folder('petro-03', { r2Files: {} });
    await expect(ensureLocal(dir, 'youtube.mp4', { r2: mockR2({}) })).rejects.toThrow(/missing locally and .*r2\.json has no R2 record/);
    const dir2 = folder('petro-04');
    await expect(ensureLocal(dir2, 'youtube.mp4', { r2: null })).rejects.toThrow(/R2 is not configured/);
    expect(fileSource(dir2, 'youtube.mp4', { r2: null })).toBe('missing');
    expect(fileSource(dir2, 'youtube.mp4', { r2: mockR2({}) })).toBe('r2');
  });

  test('a file that is still local is used as is; R2 is not touched', async () => {
    const dir = folder('petro-03', { local: ['youtube.mp4', 'thumbnail.jpg'] });
    const r2 = mockR2({});
    const db = mockDb();
    await run(task(dir), { r2, db, yt: mockYt() });
    expect(r2.get).not.toHaveBeenCalled();
    expect(db.updateTask.mock.calls[0][1].status).toBe('done');
  });
});

describe('thumbnail fallback for tasks proposed before #1176', () => {
  test('no thumbnail_file in the payload: the local thumbnail.jpg is set after the upload', async () => {
    const dir = folder('petro-03', { local: ['youtube.mp4', 'thumbnail.jpg'] });
    const yt = mockYt();
    const db = mockDb();
    await run(task(dir), { r2: mockR2({}), db, yt });
    expect(yt.thumbnailsSet).toHaveBeenCalledWith(expect.objectContaining({ videoId: 'vidNEW', filePath: path.join(dir, 'thumbnail.jpg'), contentType: 'image/jpeg' }));
    const { result } = db.updateTask.mock.calls[0][1];
    expect(result.thumbnail).toBe(true);
    expect(result.thumbnail_file).toBe('thumbnail.jpg');
    expect(result.warnings).toBeUndefined();
  });

  test('falls back to thumbnail.png when there is no jpg', async () => {
    const dir = folder('petro-03', { local: ['youtube.mp4', 'thumbnail.png'], r2Files: { 'youtube.mp4': VIDEO } });
    const yt = mockYt();
    await run(task(dir), { r2: mockR2({}), db: mockDb(), yt });
    expect(yt.thumbnailsSet).toHaveBeenCalledWith(expect.objectContaining({ filePath: path.join(dir, 'thumbnail.png'), contentType: 'image/png' }));
  });

  test('thumbnail missing locally: fetched from R2 (verified) and set; video restored too', async () => {
    const dir = folder('petro-03');
    const r2 = mockR2({ 'petro-03/youtube.mp4': VIDEO, 'petro-03/thumbnail.jpg': THUMB });
    const yt = mockYt();
    const db = mockDb();
    await run(task(dir), { r2, db, yt });
    expect(r2.get.mock.calls.map((c) => c[1])).toEqual(['petro-03/youtube.mp4', 'petro-03/thumbnail.jpg']);
    expect(yt.thumbnailsSet).toHaveBeenCalledWith(expect.objectContaining({ filePath: path.join(dir, 'thumbnail.jpg') }));
    expect(db.updateTask.mock.calls[0][1].result.thumbnail).toBe(true);
  });

  test('a thumbnail that R2 cannot supply is a warning; the upload still succeeds', async () => {
    const dir = folder('petro-03', { local: ['youtube.mp4'] });
    const r2 = mockR2({}); // thumbnail.jpg is in r2.json but the bucket 404s
    const yt = mockYt();
    const db = mockDb();
    await run(task(dir), { r2, db, yt });
    expect(yt.thumbnailsSet).not.toHaveBeenCalled();
    const { status, result } = db.updateTask.mock.calls[0][1];
    expect(status).toBe('done');
    expect(result.warnings.join(' ')).toMatch(/thumbnail: .*R2 fetch of petro-03\/thumbnail\.jpg failed/);
  });

  test('a folder with no thumbnail anywhere uploads without one and without a warning', async () => {
    const dir = folder('petro-03', { local: ['youtube.mp4'], r2Files: { 'youtube.mp4': VIDEO } });
    const yt = mockYt();
    const db = mockDb();
    await run(task(dir), { r2: mockR2({}), db, yt });
    expect(yt.thumbnailsSet).not.toHaveBeenCalled();
    expect(db.updateTask.mock.calls[0][1].result.warnings).toBeUndefined();
  });

  test('an explicit thumbnail_file wins over the fallback; a Short never gets one', async () => {
    expect(thumbnailCandidates({ thumbnail_file: 'thumbnail.png' })).toEqual(['thumbnail.png']);
    expect(thumbnailCandidates({})).toEqual(['thumbnail.jpg', 'thumbnail.png']);
    expect(thumbnailCandidates({ format: 'short' })).toEqual([]);
    const dir = folder('petro-03-short1', { local: ['youtube.mp4', 'thumbnail.jpg'] });
    expect(await resolveThumbnail(dir, { format: 'short' }, { r2: mockR2({}) })).toEqual({ file: null, source: 'missing', warning: null });
  });
});

test('dry run reports an R2 restore and the fallback thumbnail without fetching or writing', async () => {
  const dir = folder('petro-03');
  const r2 = mockR2({ 'petro-03/youtube.mp4': VIDEO });
  const db = mockDb();
  const lines = [];
  console.log.mockImplementation((s) => lines.push(s));
  await runTask({ task: task(dir), employee: { id: 'emp', status: 'active' }, allowlist, db, yt: null, dryRun: true, playlists: new Map(), uploaded: new Map(), r2 });
  console.log.mockImplementation(() => {});
  expect(r2.get).not.toHaveBeenCalled();
  expect(db.logAction).not.toHaveBeenCalled();
  expect(lines.join('\n')).toMatch(/restored from R2 first/);
  expect(lines.join('\n')).toMatch(/thumbnail thumbnail\.jpg \(from R2\) \(folder fallback\)/);
});
