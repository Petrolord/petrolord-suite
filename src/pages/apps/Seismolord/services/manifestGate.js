// W0.1 manifest version gate, Suite side. A stale cached build must
// refuse a newer brick store loudly instead of decoding it as garbage;
// the engine refuses by name, this wraps it in user-facing upgrade copy.
// Own module (no ingestService import) so jest can exercise the copy —
// ingestService's inline worker URL uses import.meta, which babel-jest
// cannot parse.

import { assertManifestSupported } from '../engine/manifest';

/** Returns the manifest unchanged, or throws with upgrade copy. */
export function gateManifest(manifest) {
  try {
    assertManifestSupported(manifest);
  } catch (e) {
    if (e?.name === 'UNSUPPORTED_MANIFEST') {
      throw new Error('This volume needs a newer version of Seismolord. Refresh the page to update the app, then open the volume again.');
    }
    throw e;
  }
  return manifest;
}
