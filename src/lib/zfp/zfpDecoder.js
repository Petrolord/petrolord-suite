// ZFP decompression for compressed ZGY bricks (Seismolord ZGY import,
// 2026-10-16): LLNL zfp compiled to WebAssembly (wasm-zfp, MIT; the glue is
// vendored as an ES module, tools/vendor/wasm-zfp.mjs). The engines take the
// decoder as a plain function, bytes -> Float32Array.

import factory from './wasmZfpGlue';

const ZFP_FLOAT = 3;

/**
 * A decoder over the given wasm bytes. One scratch buffer, reused; the
 * result is copied out of the wasm heap before the next call.
 * @param {{wasmBinary: ArrayBuffer|Uint8Array}} p
 * @returns {Promise<(bytes: Uint8Array) => Float32Array>}
 */
export async function createZfpDecode({ wasmBinary }) {
  const M = await factory({ wasmBinary });
  const zbuf = M._createBuffer();
  return (bytes) => {
    const ptr = M._malloc(bytes.byteLength);
    try {
      new Uint8Array(M.HEAPU8.buffer, ptr, bytes.byteLength).set(bytes);
      const rc = M._decompress(zbuf, ptr, bytes.byteLength);
      if (rc !== 0) throw new Error(`A compressed ZGY brick did not decompress (zfp error ${rc}).`);
      const dataPtr = M.getValue(zbuf, 'i32');
      const size = M.getValue(zbuf + 8, 'i32');
      const type = M.getValue(zbuf + 52, 'i32');
      if (type !== ZFP_FLOAT) throw new Error('A compressed ZGY brick holds a type other than 32-bit float.');
      const out = new Float32Array(size / 4);
      new Uint8Array(out.buffer).set(new Uint8Array(M.HEAPU8.buffer, dataPtr, size));
      return out;
    } finally {
      M._free(ptr);
    }
  };
}
