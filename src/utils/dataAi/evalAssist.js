// AI Evaluation Studio (Data & AI D5): the optional language-model helper client.
//
// Owner decision: engine first, an optional metered language model, never
// graded. The studio works fully without it. When the user presses the
// button, the query and the passages the current retrieval settings return
// (at most ten) go to the ai-eval-assist edge function, which asks a hosted
// language model to answer only from those passages and cite passage ids,
// logs the call against the organization and refuses once the organization
// reaches its daily cap. The answer comes back here and is then scored by the
// same deterministic groundedness check as any fixture answer
// (evalWorkflows.assistCheck). It is model output: it is never a graded
// figure, never saved as a result and never written to the report.
//
// Failure kinds map to plain messages; 503 is "not configured" (no model key
// on the server, or the function not deployed), which the panel shows as a
// state rather than an error.
export const ASSIST_FUNCTION = 'ai-eval-assist';

/** Calls per organization per UTC day; the edge function's DAILY_CAP (a test keeps the two equal). */
export const ASSIST_DAILY_CAP = 50;
/** The model the function uses unless the OPENAI_MODEL secret names another. */
export const ASSIST_DEFAULT_MODEL = 'gpt-4o-mini';

export class AssistError extends Error {
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'AssistError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

export const ASSIST_MESSAGES = {
  auth: 'Sign in again to use the language-model helper.',
  'not-member': 'The helper is metered per organization, and you are not a member of the organization selected.',
  'not-configured': 'The language-model helper is not configured on this server. Everything else in the studio works without it.',
  cap: 'Your organization has used its language-model helper calls for today. The cap resets at 00:00 UTC.',
  upstream: 'The language model did not return a usable answer. Try again, or evaluate without the helper.',
  'bad-request': 'The helper refused the request.',
  failed: 'The language-model helper is unavailable right now. Everything else in the studio works without it.',
};

export function kindForStatus(status) {
  if (status === 401) return 'auth';
  if (status === 403) return 'not-member';
  if (status === 429) return 'cap';
  if (status === 503) return 'not-configured';
  if (status === 502) return 'upstream';
  if (status === 400) return 'bad-request';
  if (status === 404) return 'not-configured';
  return 'failed';
}

async function errorFromInvoke(error) {
  const status = error?.context?.status ?? null;
  let body = null;
  try {
    if (error?.context && typeof error.context.json === 'function') body = await error.context.json();
  } catch (_e) { /* body was not JSON */ }
  const kind = kindForStatus(status);
  return new AssistError(kind, body?.error || ASSIST_MESSAGES[kind] || error?.message || 'The helper failed.', {
    status, callsToday: body?.calls_today ?? null, dailyCap: body?.daily_cap ?? null,
  });
}

/**
 * @param {{functions:{invoke:Function}}} client the supabase client
 * @param {{organizationId:string, query:string, passages:Array<{id:string,text:string}>}} req
 * @returns {Promise<{answer:string, citations:string[], model:string|null, usage:Object|null, callsToday:number|null, dailyCap:number|null}>}
 */
export async function askAssist(client, { organizationId, query, passages }) {
  if (!organizationId) throw new AssistError('not-member', 'The helper is metered per organization. Join or select an organization to use it.');
  if (!query || !Array.isArray(passages) || !passages.length) {
    throw new AssistError('bad-request', 'The current retrieval settings return no passage for this query, so there is nothing to answer from.');
  }
  const { data, error } = await client.functions.invoke(ASSIST_FUNCTION, {
    body: { organization_id: organizationId, query, passages: passages.map((p) => ({ id: p.id, text: p.text })) },
  });
  if (error) throw await errorFromInvoke(error);
  if (!data || data.error || typeof data.answer !== 'string') throw new AssistError('upstream', data?.error || ASSIST_MESSAGES.upstream);
  return {
    answer: data.answer,
    citations: Array.isArray(data.citations) ? data.citations.filter((c) => typeof c === 'string' && c.length > 0) : [],
    model: data.model || null,
    usage: data.usage || null,
    callsToday: data.calls_today ?? null,
    dailyCap: data.daily_cap ?? null,
  };
}
