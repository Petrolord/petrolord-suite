// One inflate helper for the slice worker's pool (services/deflatePool.js,
// the same protocol as the conversion's deflate helpers): decompresses a
// v4 brick with the platform DecompressionStream('deflate-raw') and hands
// the bytes back (transferred). DecompressionStream runs on the thread
// that calls it, and inflating 392 display bricks for an inline took about
// a second on one thread.

import { nativeInflateRaw } from '../engine/brickCodecV4';

self.onmessage = async (e) => {
  const { id, buf } = e.data;
  try {
    const out = await nativeInflateRaw(new Uint8Array(buf));
    const ab = out.byteOffset === 0 && out.byteLength === out.buffer.byteLength
      ? out.buffer : out.slice().buffer;
    self.postMessage({ id, buf: ab }, [ab]);
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
