// Import trap (owner report 2026-10-17): a picked, unstarted import and the
// viewer's last view outlive the dialog and a visit to another app, and a
// server upload runs as a background job that pauses, resumes without a
// re-pick, and reports failures.
import {
  beginImportDraft, updateImportDraft, clearImportDraft, getImportDraft,
  getViewerMemory, rememberVolume, rememberLocalFile, resetImportMemory,
} from '../services/importDraft';
import {
  startServerUpload, pauseServerUpload, resumeServerUpload, dismissServerUpload,
  getServerUploads, subscribeServerUploads, resetServerUploads, UPLOAD_PHASE,
} from '../services/serverUploadsRuntime';
import { describeServerUpload } from '../components/workspace/ImportJobsIndicator';

const tick = () => new Promise((r) => { setTimeout(r, 0); });
const fileA = { name: 'legacy.zgy', size: 100 };
const fileB = { name: 'other.sgy', size: 50 };

beforeEach(() => { resetImportMemory(); resetServerUploads(); });

describe('import draft', () => {
  test('a picked file and its choices are kept until the import starts or is discarded', () => {
    beginImportDraft(fileA, { ilByte: 189 });
    updateImportDraft(fileA, { choices: { crsTag: 'EPSG:32632', domain: 'time' } });
    expect(getImportDraft()).toMatchObject({ file: fileA, mapping: { ilByte: 189 }, choices: { crsTag: 'EPSG:32632' } });
    // choices for another file never overwrite this draft
    updateImportDraft(fileB, { choices: { crsTag: 'LOCAL' } });
    expect(getImportDraft().choices.crsTag).toBe('EPSG:32632');
    clearImportDraft();
    expect(getImportDraft()).toBeNull();
  });

  test('picking another file replaces the draft', () => {
    beginImportDraft(fileA, {});
    beginImportDraft(fileB, {});
    expect(getImportDraft().file).toBe(fileB);
    expect(getImportDraft().choices).toBeNull();
  });

  test('the viewer remembers the last stored volume or local file, whichever came last', () => {
    rememberVolume('vol-1');
    expect(getViewerMemory()).toEqual({ volumeId: 'vol-1', localFile: null });
    rememberLocalFile(fileA, { ilByte: 9 });
    expect(getViewerMemory().localFile).toEqual({ file: fileA, mapping: { ilByte: 9 } });
    rememberVolume('vol-2');
    expect(getViewerMemory()).toEqual({ volumeId: 'vol-2', localFile: null });
  });
});

describe('server uploads in the background', () => {
  /** A task that uploads in steps and can be aborted, like startServerImport. */
  function fakeUpload({ total = 100, failAt = null } = {}) {
    const calls = { runs: 0, resumedFrom: [] };
    let stored = 0; // parts already on the server survive a pause
    const task = async ({ signal, onUploadProgress }) => {
      calls.runs += 1;
      calls.resumedFrom.push(stored);
      while (stored < total) {
        await tick();
        if (signal.aborted) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
        if (failAt != null && stored >= failAt) { failAt = null; throw new Error('Network down.'); }
        stored += 25;
        onUploadProgress({ bytesDone: stored, bytesTotal: total });
      }
      return { jobId: 'j1' };
    };
    return { task, calls };
  }

  test('runs to done, reports progress and calls onDone once', async () => {
    const { task } = fakeUpload();
    const done = jest.fn();
    const seen = [];
    const unsub = subscribeServerUploads(() => seen.push(getServerUploads()[0]?.bytesDone));
    const id = startServerUpload({ name: 'legacy.zgy', bytesTotal: 100, task, onDone: done });
    for (let i = 0; i < 10; i++) await tick();
    unsub();
    expect(getServerUploads()[0]).toMatchObject({ id, phase: UPLOAD_PHASE.DONE, bytesDone: 100 });
    expect(done).toHaveBeenCalledTimes(1);
    expect(seen).toContain(50);
  });

  test('pause, then resume continues from the stored parts without a re-pick', async () => {
    const { task, calls } = fakeUpload();
    const id = startServerUpload({ name: 'legacy.zgy', bytesTotal: 100, task });
    await tick(); await tick();
    pauseServerUpload(id);
    for (let i = 0; i < 4; i++) await tick();
    expect(getServerUploads()[0].phase).toBe(UPLOAD_PHASE.PAUSED);
    resumeServerUpload(id);
    for (let i = 0; i < 10; i++) await tick();
    expect(getServerUploads()[0].phase).toBe(UPLOAD_PHASE.DONE);
    expect(calls.runs).toBe(2);
    expect(calls.resumedFrom[1]).toBeGreaterThan(0);
  });

  test('a failure is reported and can be resumed; dismiss removes the row', async () => {
    const { task } = fakeUpload({ failAt: 50 });
    const onError = jest.fn();
    const id = startServerUpload({ name: 'legacy.zgy', bytesTotal: 100, task, onError });
    for (let i = 0; i < 6; i++) await tick();
    expect(getServerUploads()[0]).toMatchObject({ phase: UPLOAD_PHASE.FAILED, error: 'Network down.' });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(describeServerUpload(getServerUploads()[0])).toBe('legacy.zgy: upload stopped. Network down.');
    resumeServerUpload(id);
    for (let i = 0; i < 10; i++) await tick();
    expect(getServerUploads()[0].phase).toBe(UPLOAD_PHASE.DONE);
    dismissServerUpload(id);
    expect(getServerUploads()).toEqual([]);
  });

  test('closing the tab mid-upload asks first; not once it is done', async () => {
    const add = jest.spyOn(window, 'addEventListener');
    const remove = jest.spyOn(window, 'removeEventListener');
    const { task } = fakeUpload();
    startServerUpload({ name: 'legacy.zgy', bytesTotal: 100, task });
    expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    for (let i = 0; i < 10; i++) await tick();
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    add.mockRestore(); remove.mockRestore();
  });

  test('status bar words', () => {
    expect(describeServerUpload({ name: 'a.zgy', phase: UPLOAD_PHASE.UPLOADING, bytesDone: 50 * 1048576, bytesTotal: 100 * 1048576, mbps: 1 }))
      .toBe('a.zgy: uploading to the server 50% (50 MB of 100 MB), about 50 s left');
    expect(describeServerUpload({ name: 'b.zgy', phase: UPLOAD_PHASE.UPLOADING, bytesDone: 0, bytesTotal: 600 * 1048576, mbps: 1 }))
      .toBe('b.zgy: uploading to the server 0% (0.0 MB of 600 MB), about 10 min left');
    expect(describeServerUpload({ name: 'g.sgy', kind: 'gathers', phase: UPLOAD_PHASE.DONE })).toBe('g.sgy: gathers uploaded');
    expect(describeServerUpload({ name: 'a.zgy', phase: UPLOAD_PHASE.PAUSED, bytesDone: 1, bytesTotal: 4 })).toBe('a.zgy: upload paused at 25%');
  });
});
