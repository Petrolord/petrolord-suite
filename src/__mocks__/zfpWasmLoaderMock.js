// jest stand-in for src/lib/zfp/zfpWasmLoader.js (a Vite `?url` import):
// the same decoder over the wasm file read from node_modules.
import fs from 'fs';
import path from 'path';
import { createZfpDecode } from '../lib/zfp/zfpDecoder';

let pending = null;
export function loadZfpDecode() {
  if (!pending) {
    const wasmBinary = fs.readFileSync(path.join(__dirname, '../../node_modules/wasm-zfp/dist/wasm-zfp.wasm'));
    pending = createZfpDecode({ wasmBinary });
  }
  return pending;
}
