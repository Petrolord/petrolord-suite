// 2D line ingest worker (W5.2): scan + strip transcode off the main
// thread, the ingest.worker.js shell one dimension down. Strips upload
// on the main thread under the same ack backpressure.
//
// (main -> worker):
//   {type:'scan2d',   id, file, mapping}
//   {type:'ingest2d', id, file, mapping}
//   {type:'strip:ack', id}
//   {type:'cancel', id}
// (worker -> main):
//   {type:'scan2d:done', id, summary, navBlob (transferred)}
//   {type:'progress', id, phase, done, total}
//   {type:'strip', id, i, k, buffer}         (buffer transferred)
//   {type:'ingest2d:done', id, summary, navBlob, transcode}
//   {type:'error', id, message}

import { fileReader } from '../engine/reader';
import { scanLine2d, transcodeLineToStrips, writeNavBlob } from '../engine/line2d';
import { createBrickChannel } from './brickAckChannel';

const channel = createBrickChannel((msg, transfer) => self.postMessage(msg, transfer));

/** The scan minus its big typed arrays (those travel as the nav blob). */
const summarize = (scan) => ({
  kind: scan.kind,
  ns: scan.ns,
  dtUs: scan.dtUs,
  formatCode: scan.formatCode,
  ntraces: scan.ntraces,
  mapping: scan.mapping,
  lengthM: scan.lengthM,
  warnings: scan.warnings,
  cdpFirst: scan.nav.cdp[0],
  cdpLast: scan.nav.cdp[scan.ntraces - 1],
  spFirst: scan.nav.sp[0],
  spLast: scan.nav.sp[scan.ntraces - 1],
});

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'scan2d') {
      const scan = await scanLine2d(fileReader(msg.file), msg.mapping, {
        onProgress: (done, total) => self.postMessage({
          type: 'progress', id: msg.id, phase: 'scan', done, total,
        }),
      });
      const navBlob = writeNavBlob(scan.nav);
      self.postMessage(
        { type: 'scan2d:done', id: msg.id, summary: summarize(scan), navBlob },
        [navBlob],
      );
    } else if (msg.type === 'ingest2d') {
      const reader = fileReader(msg.file);
      const scan = await scanLine2d(reader, msg.mapping, {
        onProgress: (done, total) => self.postMessage({
          type: 'progress', id: msg.id, phase: 'scan', done, total,
        }),
      });
      const transcode = await transcodeLineToStrips(reader, scan, {
        onProgress: (done, total) => self.postMessage({
          type: 'progress', id: msg.id, phase: 'transcode', done, total,
        }),
        onStrip: ({ i, k, data }) => channel.sendBrick(
          msg.id,
          { type: 'strip', id: msg.id, i, k, buffer: data.buffer },
          [data.buffer],
          { cancelMessage: 'Line import cancelled.' },
        ),
      });
      const navBlob = writeNavBlob(scan.nav);
      self.postMessage(
        {
          type: 'ingest2d:done', id: msg.id, summary: summarize(scan), navBlob, transcode,
        },
        [navBlob],
      );
    } else if (msg.type === 'strip:ack') channel.ack(msg.id);
    else if (msg.type === 'cancel') channel.cancel(msg.id);
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err.message });
  }
};
