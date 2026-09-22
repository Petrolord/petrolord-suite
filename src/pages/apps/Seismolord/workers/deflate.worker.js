// One deflate helper for the conversion's pool (services/deflatePool.js):
// compresses a brick with the platform CompressionStream('deflate-raw')
// and hands the bytes back (transferred).

import { nativeDeflateRaw } from '../engine/brickCodecV4';

self.onmessage = async (e) => {
  const { id, buf } = e.data;
  try {
    const out = await nativeDeflateRaw(new Uint8Array(buf));
    const ab = out.byteOffset === 0 && out.byteLength === out.buffer.byteLength
      ? out.buffer : out.slice().buffer;
    self.postMessage({ id, buf: ab }, [ab]);
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
