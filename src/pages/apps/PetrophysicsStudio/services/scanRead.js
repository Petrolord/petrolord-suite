// Client for the petro-scan-read edge function (PT7). Maps transport and
// gateway failures to kinds the dialog can phrase, and normalises the
// proposal. Never called without the user pressing the button.

import { parseScanProposal } from './scanProposal';

export const SCAN_READ_FUNCTION = 'petro-scan-read';

export class ScanReadError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'ScanReadError';
    this.kind = kind;
  }
}

export const SCAN_READ_MESSAGES = {
  auth: 'Sign in again to use the scan reader.',
  'too-large': 'The image is too large for the scan reader. Crop it to the header and one track, then try again.',
  'not-configured': 'The scan reader is not configured on this server yet (missing OPENAI_API_KEY). Calibrate by hand.',
  upstream: 'The scan reader could not read this image. Calibrate by hand or try a clearer scan.',
  'bad-request': 'The scan reader rejected the request.',
  failed: 'The scan reader is unavailable right now. Calibrate by hand.',
};

export function kindForStatus(status) {
  if (status === 401) return 'auth';
  if (status === 413) return 'too-large';
  if (status === 503) return 'not-configured';
  if (status === 502) return 'upstream';
  if (status === 400) return 'bad-request';
  return 'failed';
}

async function errorFromInvoke(error) {
  const status = error?.context?.status ?? null;
  let detail = null;
  try {
    if (error?.context && typeof error.context.json === 'function') {
      const body = await error.context.json();
      detail = body?.error || null;
    }
  } catch (_e) { /* body was not JSON */ }
  const kind = kindForStatus(status);
  return new ScanReadError(kind, detail || SCAN_READ_MESSAGES[kind] || error?.message || 'Scan read failed.');
}

/**
 * @param {{functions:{invoke:Function}}} client supabase client
 * @param {{image:string, hints?:Object}} req  image = data URL (png|jpeg|webp)
 * @returns {Promise<{proposal:Object, model:string|null, prompt_version:number|null, usage:Object|null}>}
 */
export async function readScan(client, { image, hints = {} }) {
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
    throw new ScanReadError('bad-request', 'Load an image first.');
  }
  const { data, error } = await client.functions.invoke(SCAN_READ_FUNCTION, { body: { image, hints } });
  if (error) throw await errorFromInvoke(error);
  if (!data || data.error) throw new ScanReadError('failed', data?.error || 'Scan read failed.');
  return {
    proposal: parseScanProposal(data.proposal),
    model: data.model || null,
    prompt_version: data.prompt_version ?? null,
    usage: data.usage || null,
  };
}
