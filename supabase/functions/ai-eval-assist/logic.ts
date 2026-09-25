// ai-eval-assist: the pure half (no Deno, no network), so jest can test it.
//
// AI Evaluation Studio (Data & AI D5), owner decision: engine first, an
// optional metered language model, never graded. This module holds the
// request rules, the prompt, the reply parser and the metering constants;
// index.ts does auth, membership, metering and the model call.

/** Helper calls per organization per UTC day. The help guide states it; src/utils/dataAi/evalAssist.js ASSIST_DAILY_CAP must equal it. */
export const DAILY_CAP = 50;
export const FUNCTION_NAME = 'ai-eval-assist';
export const DEFAULT_MODEL = 'gpt-4o-mini';
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

/** The refusal once an organization reaches its cap. */
export function capMessage(cap: number = DAILY_CAP): string {
  return `This organization has used its ${cap} helper calls for today (UTC). The cap resets at 00:00 UTC; everything else in the AI Evaluation Studio works without the helper.`;
}
