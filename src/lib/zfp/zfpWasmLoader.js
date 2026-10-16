// The wasm bytes for zfpDecoder, fetched once per worker. Kept alone because
// of the Vite `?url` import (jest maps this module to a mock that reads the
// file from node_modules).
// eslint-disable-next-line import/no-unresolved -- a Vite asset query the resolver does not know
import wasmUrl from 'wasm-zfp/dist/wasm-zfp.wasm?url';
import { createZfpDecode } from './zfpDecoder';

let pending = null;

/** The ZFP decoder, loaded on first use. */
export function loadZfpDecode() {
  if (!pending) {
    pending = fetch(wasmUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`The ZFP decoder did not load (${r.status}).`);
        return r.arrayBuffer();
      })
      .then((wasmBinary) => createZfpDecode({ wasmBinary }))
      .catch((e) => { pending = null; throw e; });
  }
  return pending;
}
