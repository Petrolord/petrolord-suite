#!/usr/bin/env node
// Local stand-in for Supabase Storage for the Seismolord large-survey
// benchmark. It serves one volume's manifest and its 64^3 float32 bricks
// out of a single concatenated file, at the same URL shape the viewer's
// brick fetcher builds:
//
//   /storage/v1/object/authenticated/seismic/<volume>/manifest.json
//   /storage/v1/object/authenticated/seismic/<volume>/bricks/{i}-{j}-{k}.f32
//
// Nothing here talks to Supabase: the benchmark never uploads to the live
// project. Build the brick file with tools/seismolord-bench/make-bricks.mjs.
//
// usage: node mock-storage.mjs --bricks <file> --manifest <file>
//        [--port 8899] [--volume bench] [--mbps 0] [--latency-ms 0]
//
// --mbps shapes the whole link, shared by every connection, the way a
// real 10 Mbps line is (a per-connection rate would multiply by the
// viewer's 12 fetches in flight). --latency-ms is added per request.

import fs from 'node:fs';
import http from 'node:http';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const bricksPath = arg('bricks', '/root/seis-bench/out/bricks-v1.bin');
const manifestPath = arg('manifest', '/root/seis-bench/out/bench-manifest.json');
const port = Number(arg('port', 8899));
const volume = arg('volume', 'bench');
const mbps = Number(arg('mbps', 0));          // 0 = as fast as the disk
const bytesPerMs = mbps ? (mbps * 1e6) / 8 / 1000 : 0;
const latencyMs = Number(arg('latency-ms', 0));

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const [ni, nj, nk] = manifest.brick.grid;
const brickBytes = manifest.brick.size ** 3 * 4;
const fd = fs.openSync(bricksPath, 'r');
const stats = { bricks: 0, bytes: 0 };

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

// One shared link: each piece books the next free slot on it.
let linkFreeAt = 0;
const sendOnLink = async (bytes) => {
  const now = Date.now();
  linkFreeAt = Math.max(now, linkFreeAt) + bytes / bytesPerMs;
  const wait = linkFreeAt - now;
  if (wait > 1) await sleep(wait);
};

const server = http.createServer(async (req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  const base = `/storage/v1/object/authenticated/seismic/${volume}/`;
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/bench/stats') {
    res.writeHead(200, { ...cors, 'content-type': 'application/json' });
    res.end(JSON.stringify(stats));
    return;
  }
  if (url === `${base}manifest.json`) {
    res.writeHead(200, { ...cors, 'content-type': 'application/json' });
    res.end(JSON.stringify(manifest));
    return;
  }
  const m = new RegExp(`^${base}bricks/(\\d+)-(\\d+)-(\\d+)\\.f32$`).exec(url);
  if (!m) { res.writeHead(404, cors); res.end('not found'); return; }
  const [i, j, k] = m.slice(1).map(Number);
  if (i >= ni || j >= nj || k >= nk) { res.writeHead(404, cors); res.end('out of grid'); return; }
  const buf = Buffer.allocUnsafe(brickBytes);
  fs.readSync(fd, buf, 0, brickBytes, ((i * nj + j) * nk + k) * brickBytes);
  stats.bricks += 1;
  stats.bytes += brickBytes;
  if (latencyMs) await sleep(latencyMs);
  res.writeHead(200, { ...cors, 'content-type': 'application/octet-stream', 'content-length': brickBytes });
  if (!bytesPerMs) { res.end(buf); return; }
  // shaped: 64 KB pieces, each waiting for its slot on the shared link
  const piece = 64 * 1024;
  let aborted = false;
  res.on('close', () => { if (!res.writableFinished) aborted = true; });
  for (let off = 0; off < brickBytes && !aborted; off += piece) {
    const end = Math.min(off + piece, brickBytes);
    // eslint-disable-next-line no-await-in-loop
    await sendOnLink(end - off);
    res.write(buf.subarray(off, end));
  }
  res.end();
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`mock storage on http://127.0.0.1:${port} volume ${volume} `
    + `(${ni}x${nj}x${nk} bricks of ${brickBytes} B)`
    + `${mbps ? `, link ${mbps} Mbps` : ''}${latencyMs ? `, +${latencyMs} ms` : ''}\n`);
});
