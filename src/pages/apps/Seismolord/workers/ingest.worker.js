// Ingest worker: runs the streaming scan + brick transcode off the main
// thread. All numerics live in the engine modules (jest-tested); this
// file is only the postMessage shell (plan of record: progress and
// cancellation via worker messaging, no server jobs).
//
// Protocol (main -> worker):
//   {type:'scan',   id, file, mapping, maxTraces}
//   {type:'ingest', id, file, mapping, memoryBudgetBytes}
//   {type:'brick:ack', id}            upload finished for one brick
//   {type:'cancel', id}
// (worker -> main):
//   {type:'scan:done', id, scan, textLines, preview}
//   {type:'progress', id, phase, done, total}
//   {type:'brick', id, i, j, k, buffer}      (buffer transferred)
//   {type:'ingest:done', id, scan, result}
//   {type:'error', id, message}

import { fileReader } from '../engine/reader';
import { readTextualHeader, scanGeometry, previewTraceHeaders } from '../engine/segyScan';
import { transcodeToBricks } from '../engine/brickTranscode';

const MAX_UNACKED_BRICKS = 4;   // backpressure: don't outrun the uploads

const jobs = new Map();         // id -> {cancelled, unacked, wake}

const state = (id) => {
  if (!jobs.has(id)) jobs.set(id, { cancelled: false, unacked: 0, wake: null });
  return jobs.get(id);
};

async function handleScan({ id, file, mapping, maxTraces }) {
  const reader = fileReader(file);
  const [textLines, preview, scan] = [
    await readTextualHeader(reader),
    await previewTraceHeaders(reader, mapping),
    await scanGeometry(reader, mapping, {
      maxTraces: maxTraces ?? 20000,
      onProgress: (done, total) => self.postMessage({ type: 'progress', id, phase: 'scan', done, total }),
    }),
  ];
  self.postMessage({ type: 'scan:done', id, scan, textLines, preview });
}

async function handleIngest({ id, file, mapping, memoryBudgetBytes }) {
  const job = state(id);
  const reader = fileReader(file);
  const scan = await scanGeometry(reader, mapping, {
    onProgress: (done, total) => self.postMessage({ type: 'progress', id, phase: 'scan', done, total }),
  });

  const result = await transcodeToBricks(reader, scan, {
    memoryBudgetBytes,
    onProgress: (done, total) => self.postMessage({ type: 'progress', id, phase: 'transcode', done, total }),
    onBrick: async ({ i, j, k, data }) => {
      if (job.cancelled) throw new Error('Ingestion cancelled.');
      self.postMessage({ type: 'brick', id, i, j, k, buffer: data.buffer }, [data.buffer]);
      job.unacked += 1;
      while (job.unacked >= MAX_UNACKED_BRICKS && !job.cancelled) {
        await new Promise((resolve) => { job.wake = resolve; });
      }
      if (job.cancelled) throw new Error('Ingestion cancelled.');
    },
  });

  self.postMessage({ type: 'ingest:done', id, scan, result });
}

self.onmessage = async (e) => {
  const msg = e.data;
  const job = state(msg.id);
  try {
    if (msg.type === 'scan') await handleScan(msg);
    else if (msg.type === 'ingest') await handleIngest(msg);
    else if (msg.type === 'brick:ack') {
      job.unacked -= 1;
      if (job.wake) { job.wake(); job.wake = null; }
    } else if (msg.type === 'cancel') {
      job.cancelled = true;
      if (job.wake) { job.wake(); job.wake = null; }
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err.message });
  }
};
