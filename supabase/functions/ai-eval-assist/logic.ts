// ai-eval-assist: the pure half (no Deno, no network), so jest can test it.
//
// AI Evaluation Studio (Data & AI D5), owner decision: engine first, an
// optional metered language model, never graded. This module holds the
// request rules, the prompt, the reply parser and the metering constants;
// index.ts does auth, membership, metering and the model call.

/** Helper calls per organization per UTC day (owner decision 2026-09-26). The help guide states it; src/utils/dataAi/evalAssist.js ASSIST_DAILY_CAP must equal it. */
export const DAILY_CAP = 200;
/** Helper calls per person per organization per UTC day (owner decision 2026-09-26); evalAssist.js ASSIST_USER_DAILY_CAP must equal it. */
export const USER_DAILY_CAP = 40;
export const FUNCTION_NAME = 'ai-eval-assist';
/** OpenAI's efficient reasoning model (owner decision 2026-09-26); the OPENAI_MODEL secret overrides it. */
export const DEFAULT_MODEL = 'gpt-6-luna';
/** The reasoning efforts OpenAI accepts, and the one sent unless the OPENAI_REASONING_EFFORT secret names another. */
export const REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ReasoningEffort = typeof REASONING_EFFORTS[number];
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'low';
export const MAX_PASSAGES = 10;
export const MAX_PASSAGE_CHARS = 4000;
export const MAX_QUERY_CHARS = 1000;
export const MAX_ID_CHARS = 100;

export const SYSTEM_PROMPT = [
  'You answer one question about oilfield documents using ONLY the passages supplied with it.',
  '',
  'Rules, in order of priority:',
  '1. Use only facts stated in the supplied passages. Never add a figure, date, name or event that is not in them.',
  '2. Cite the id of every passage you use, exactly as given (for example EKD-018).',
  '3. If the passages do not answer the question, say so in one sentence and cite nothing.',
  '4. Copy numbers and dates exactly as the passage prints them; do not round or convert units.',
  '5. Keep the answer to at most three sentences of plain English. Do not use em dashes.',
  '6. Reply with one JSON object and nothing else: {"answer": "<your answer>", "citations": ["<passage id>", ...]}.',
].join('\n');

export type Passage = { id: string; text: string };
export type AssistRequest = { organizationId: string; query: string; passages: Passage[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The request body checked; every refusal names the field and the exact condition. */
export function validateRequest(body: unknown): { ok: true; value: AssistRequest } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const org = b.organization_id;
  if (typeof org !== 'string' || !UUID.test(org)) return { ok: false, error: 'organization_id must be the id of your organization (a UUID).' };
  const q = b.query;
  if (typeof q !== 'string' || !q.trim()) return { ok: false, error: 'query must be a non-empty string.' };
  if (q.length > MAX_QUERY_CHARS) return { ok: false, error: `query has ${q.length} characters; the helper takes up to ${MAX_QUERY_CHARS}.` };
  const ps = b.passages;
  if (!Array.isArray(ps) || ps.length === 0) return { ok: false, error: 'passages must be a non-empty array of { id, text }.' };
  if (ps.length > MAX_PASSAGES) return { ok: false, error: `passages has ${ps.length} entries; the helper takes up to ${MAX_PASSAGES}.` };
  const seen = new Set<string>();
  const out: Passage[] = [];
  for (let i = 0; i < ps.length; i += 1) {
    const p = ps[i] as Record<string, unknown>;
    if (!p || typeof p !== 'object') return { ok: false, error: `passages[${i}] must be an object { id, text }.` };
    if (typeof p.id !== 'string' || !p.id.trim() || p.id.length > MAX_ID_CHARS) return { ok: false, error: `passages[${i}].id must be a non-empty string of up to ${MAX_ID_CHARS} characters.` };
    if (seen.has(p.id)) return { ok: false, error: `passages[${i}].id repeats ${p.id}.` };
    seen.add(p.id);
    if (typeof p.text !== 'string') return { ok: false, error: `passages[${i}].text must be a string.` };
    if (p.text.length > MAX_PASSAGE_CHARS) return { ok: false, error: `passages[${i}].text has ${p.text.length} characters; the helper takes up to ${MAX_PASSAGE_CHARS}.` };
    out.push({ id: p.id, text: p.text });
  }
  return { ok: true, value: { organizationId: org, query: q.trim(), passages: out } };
}

/** The user message: the question, then each passage with its id. */
export function buildUserPrompt(query: string, passages: Passage[]): string {
  return [
    `Question: ${query}`,
    '',
    'Passages:',
    ...passages.map((p) => `[${p.id}] ${p.text}`),
  ].join('\n');
}

/**
 * The model's reply read as { answer, citations }. Citations are kept as the
 * model gave them (strings only, first occurrence, at most 20); an id that
 * is not a supplied passage is NOT removed here, so the studio's
 * deterministic check can flag it. A reply that is not the JSON asked for is
 * refused.
 */
export function parseModelReply(content: unknown): { ok: true; answer: string; citations: string[] } | { ok: false; error: string } {
  if (typeof content !== 'string' || !content.trim()) return { ok: false, error: 'The model returned an empty reply.' };
  let obj: unknown;
  try {
    obj = JSON.parse(content);
  } catch {
    return { ok: false, error: 'The model reply was not the JSON object asked for.' };
  }
  const o = (obj && typeof obj === 'object' ? obj : {}) as Record<string, unknown>;
  if (typeof o.answer !== 'string') return { ok: false, error: 'The model reply has no answer text.' };
  const raw = Array.isArray(o.citations) ? o.citations : [];
  const citations: string[] = [];
  raw.forEach((c) => { if (typeof c === 'string' && c.trim() && !citations.includes(c.trim()) && citations.length < 20) citations.push(c.trim()); });
  return { ok: true, answer: o.answer.trim(), citations };
}

export type CapHit = 'organization' | 'user';
export type CapCounts = { callsToday: number; userCallsToday: number; dailyCap?: number; userDailyCap?: number };

/**
 * The refusal once a cap is reached, naming the cap (the organization's or
 * the person's own) and both counts. `hit` is the reserve function's
 * cap_hit: 'organization' or 'user'.
 */
export function capMessage(hit: CapHit, { callsToday, userCallsToday, dailyCap = DAILY_CAP, userDailyCap = USER_DAILY_CAP }: CapCounts): string {
  const tail = 'Both caps reset at 00:00 UTC; everything else in the AI Evaluation Studio works without the helper.';
  if (hit === 'user') {
    return `Personal cap reached: you have made ${userCallsToday} of your ${userDailyCap} helper calls for today (UTC), and your organization has made ${callsToday} of its ${dailyCap}. ${tail}`;
  }
  return `Organization cap reached: this organization has made ${callsToday} of its ${dailyCap} helper calls for today (UTC), and you have made ${userCallsToday} of your ${userDailyCap}. ${tail}`;
}

/**
 * True for OpenAI reasoning models (the gpt-5 and gpt-6 families and the
 * o-series such as o1, o3 and o4-mini). They take reasoning_effort and may
 * refuse a temperature other than the default. gpt-4o and gpt-4.1 models,
 * and the gpt-5 "chat" aliases (gpt-5-chat-latest), are treated as
 * non-reasoning models.
 */
export function isReasoningModel(model: string): boolean {
  const m = String(model ?? '').trim().toLowerCase();
  if (/^gpt-[56](?![0-9])/.test(m)) return !/-chat(-|$)/.test(m);
  return /^o\d/.test(m);
}

/**
 * The OPENAI_REASONING_EFFORT secret read against the allowed list. Unset or
 * blank gives the default; a value outside the list also gives the default,
 * with a warning for the log naming the value and the list.
 */
export function resolveReasoningEffort(raw: string | undefined | null): { effort: ReasoningEffort; warning: string | null } {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!v) return { effort: DEFAULT_REASONING_EFFORT, warning: null };
  if ((REASONING_EFFORTS as readonly string[]).includes(v)) return { effort: v as ReasoningEffort, warning: null };
  return {
    effort: DEFAULT_REASONING_EFFORT,
    warning: `OPENAI_REASONING_EFFORT is "${raw}", which is not one of ${REASONING_EFFORTS.join(', ')}; using ${DEFAULT_REASONING_EFFORT}.`,
  };
}

/** The structured-output schema of the reply; parseModelReply reads the same shape. */
export const REPLY_SCHEMA = {
  name: 'grounded_answer',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      answer: { type: 'string' },
      citations: { type: 'array', items: { type: 'string' } },
    },
    required: ['answer', 'citations'],
    additionalProperties: false,
  },
} as const;

/**
 * The Chat Completions request body. A reasoning model gets reasoning_effort
 * and no temperature; any other model gets temperature 0 and no
 * reasoning_effort. Both ask for the reply as structured output.
 */
export function buildChatRequest(model: string, query: string, passages: Passage[], effort: ReasoningEffort = DEFAULT_REASONING_EFFORT): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(query, passages) },
    ],
    response_format: { type: 'json_schema', json_schema: REPLY_SCHEMA },
  };
  if (isReasoningModel(model)) body.reasoning_effort = effort;
  else body.temperature = 0;
  return body;
}

/**
 * A provider error read for the log and the call's error column. A 400 that
 * mentions an unsupported or unknown parameter is called out by name, so a
 * model that refuses temperature or reasoning_effort is easy to spot.
 */
export function describeProviderError(status: number, bodyText: string, model: string): { unsupportedParameter: boolean; log: string; error: string } {
  let message = '';
  let param: string | null = null;
  try {
    const j = JSON.parse(bodyText);
    message = String(j?.error?.message ?? '');
    param = typeof j?.error?.param === 'string' ? j.error.param : null;
  } catch {
    message = String(bodyText ?? '');
  }
  const unsupportedParameter = status === 400 && /unsupported|not supported|unrecognized|unknown parameter|does not support/i.test(message || bodyText);
  if (unsupportedParameter) {
    const which = param ?? (message.match(/'([a-z_]+)'/i)?.[1] ?? 'a parameter');
    return {
      unsupportedParameter,
      log: `OpenAI refused ${which} for model ${model} (400 unsupported parameter): ${message.slice(0, 300)}. Check OPENAI_MODEL and OPENAI_REASONING_EFFORT.`,
      error: `provider 400 unsupported parameter: ${which}`.slice(0, 300),
    };
  }
  return { unsupportedParameter, log: `OpenAI error ${status} for model ${model}: ${(message || bodyText).slice(0, 500)}`, error: `provider ${status}` };
}
