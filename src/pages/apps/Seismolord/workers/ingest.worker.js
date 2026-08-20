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
import { createBrickChannel } from './brickAckChannel';

const channel = createBrickChannel((msg, transfer) => self.postMessage(msg, transfer));

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
  const reader = fileReader(file);
  const scan = await scanGeometry(reader, mapping, {
    onProgress: (done, total) => self.postMessage({ type: 'progress', id, phase: 'scan', done, total }),
  });

  const result = await transcodeToBricks(reader, scan, {
    memoryBudgetBytes,
    onProgress: (done, total) => self.postMessage({ type: 'progress', id, phase: 'transcode', done, total }),
    onBrick: ({ i, j, k, data }) => channel.sendBrick(
      id,
      { type: 'brick', id, i, j, k, buffer: data.buffer },
      [data.buffer],
      { cancelMessage: 'Ingestion cancelled.' },
    ),
  });

  self.postMessage({ type: 'ingest:done', id, scan, result });
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'scan') await handleScan(msg);
    else if (msg.type === 'ingest') await handleIngest(msg);
    else if (msg.type === 'brick:ack') channel.ack(msg.id);
    else if (msg.type === 'cancel') channel.cancel(msg.id);
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err.message });
  }
};
