// Request parsing and error replies shared by the EPE Edge Functions
// (epe-cash-flow-engine, epe-cash-flow-engine-batch).
//
// 2026-10-14: a malformed body (not JSON, or missing ids) used to throw inside
// the main try block and come back as HTTP 500 with the JavaScript stack in
// the body. It is now HTTP 400 with one plain sentence, and no error reply
// carries a stack (the stack goes to the function log). The caller check that
// follows the parsing is unchanged.

export class EpeBadRequest extends Error {
  readonly status = 400;
}

/** The JSON object in the request body, or an EpeBadRequest. */
export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new EpeBadRequest('The request body must be JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new EpeBadRequest('The request body must be a JSON object.');
  }
  return body as Record<string, unknown>;
}

/** Throws an EpeBadRequest naming every required id that is missing or not a string. */
export function requireIds(body: Record<string, unknown>, keys: string[]): void {
  const missing = keys.filter((k) => typeof body[k] !== 'string' || !(body[k] as string).trim());
  if (missing.length) throw new EpeBadRequest(`Missing ${missing.join(', ')}.`);
}

/** The status an error replies with: 400 for a bad request, 500 otherwise. */
export function errorStatus(err: unknown): number {
  return err instanceof EpeBadRequest ? 400 : 500;
}

/** An error reply with the message only (never the stack). */
export function errorResponse(err: unknown, headers: Record<string, string>, fallback: string): Response {
  const message = (err as { message?: string })?.message || fallback;
  return new Response(JSON.stringify({ error: message }), {
    status: errorStatus(err), headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
