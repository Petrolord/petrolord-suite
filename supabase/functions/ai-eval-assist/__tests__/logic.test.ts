// ai-eval-assist pure half (AI Evaluation Studio, Data & AI D5): the request
// rules, the prompt, the reply parser and the metering constants. The studio
// side (src/utils/dataAi/evalAssist.js) must state the same cap.
import fs from 'fs';
import path from 'path';
import {
  DAILY_CAP, DEFAULT_MODEL, DEFAULT_REASONING_EFFORT, MAX_PASSAGES, REASONING_EFFORTS, REPLY_SCHEMA, SYSTEM_PROMPT, USER_DAILY_CAP,
  buildChatRequest, buildUserPrompt, capMessage, describeProviderError, isReasoningModel, parseModelReply, resolveReasoningEffort, validateRequest,
} from '../logic.ts';
import {
  ASSIST_DAILY_CAP, ASSIST_DEFAULT_MODEL, ASSIST_FUNCTION, ASSIST_USER_DAILY_CAP,
} from '../../../../src/utils/dataAi/evalAssist.js';
import { ASSIST_MAX_PASSAGES } from '../../../../src/utils/dataAi/evalWorkflows.js';

const ORG = '10000000-0000-4000-8000-000000000001';
const ok = { organization_id: ORG, query: 'reservoir pressure at flood start', passages: [{ id: 'EKD-018', text: 'Average reservoir pressure 2,096 psia on 2023-01-01.' }] };

describe('the metering constants', () => {
  it('match the studio and the help guide', () => {
    expect(DAILY_CAP).toBe(200);
    expect(USER_DAILY_CAP).toBe(40);
    expect(DEFAULT_MODEL).toBe('gpt-6-luna');
    expect(ASSIST_DAILY_CAP).toBe(DAILY_CAP);
    expect(ASSIST_USER_DAILY_CAP).toBe(USER_DAILY_CAP);
    expect(ASSIST_DEFAULT_MODEL).toBe(DEFAULT_MODEL);
    expect(ASSIST_MAX_PASSAGES).toBe(MAX_PASSAGES);
    expect(ASSIST_FUNCTION).toBe('ai-eval-assist');
  });

  it('reserves through the metering function with the cap, before the model runs, and logs failures as errors', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');
    const reserve = src.indexOf("admin.rpc('dai_llm_reserve_call'");
    const model = src.indexOf("fetch('https://api.openai.com/v1/chat/completions'");
    expect(reserve).toBeGreaterThan(0);
    expect(model).toBeGreaterThan(reserve);
    expect(src).toContain('p_cap: DAILY_CAP, p_user_cap: USER_DAILY_CAP');
    expect(src).toContain('buildChatRequest(model, query, passages, effort)');
    expect(src).toContain('reasoning_effort: reasoningEffort');
    expect(src).toContain('describeProviderError(res.status');
    expect(src).not.toMatch(/temperature:/);
    expect(src).toContain("rpc('is_org_member', { org_id: organizationId })");
    expect(src.indexOf("rpc('is_org_member'")).toBeLessThan(reserve);
    expect(src).toMatch(/status: 'error'/);
    expect(src).toMatch(/status: 'ok', tokens_in: usage\?\.prompt_tokens/);
    expect(src).toContain('}, 429);');
    expect(src).toContain('}, 503);');
    expect(src).not.toMatch(/[–—]/);
  });
});

describe('validateRequest', () => {
  it('accepts a well-formed request', () => {
    expect(validateRequest(ok)).toEqual({ ok: true, value: { organizationId: ORG, query: ok.query, passages: ok.passages } });
  });
  it.each([
    [{ ...ok, organization_id: 'org-1' }, 'organization_id must be the id of your organization (a UUID).'],
    [{ ...ok, query: '  ' }, 'query must be a non-empty string.'],
    [{ ...ok, query: 'x'.repeat(1001) }, 'query has 1001 characters; the helper takes up to 1000.'],
    [{ ...ok, passages: [] }, 'passages must be a non-empty array of { id, text }.'],
    [{ ...ok, passages: Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, text: 'x' })) }, 'passages has 11 entries; the helper takes up to 10.'],
    [{ ...ok, passages: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }] }, 'passages[1].id repeats a.'],
    [{ ...ok, passages: [{ id: 'a', text: 'x'.repeat(4001) }] }, 'passages[0].text has 4001 characters; the helper takes up to 4000.'],
    [null, 'organization_id must be the id of your organization (a UUID).'],
  ])('refuses a bad request by name (%#)', (body, error) => {
    expect(validateRequest(body)).toEqual({ ok: false, error });
  });
});

describe('the prompt', () => {
  it('tells the model to use only the passages and cite their ids, and lists each passage with its id', () => {
    expect(SYSTEM_PROMPT).toContain('using ONLY the passages supplied');
    expect(SYSTEM_PROMPT).toContain('Cite the id of every passage you use');
    expect(SYSTEM_PROMPT).not.toMatch(/[–—]/);
    expect(buildUserPrompt('q?', [{ id: 'A1', text: 'one' }, { id: 'B2', text: 'two' }])).toBe('Question: q?\n\nPassages:\n[A1] one\n[B2] two');
  });
});

describe('parseModelReply', () => {
  it('reads the JSON object and keeps unknown citations for the deterministic check to flag', () => {
    expect(parseModelReply('{"answer":" 2,096 psia. ","citations":["EKD-018","EKD-999","EKD-018",3,""]}')).toEqual({ ok: true, answer: '2,096 psia.', citations: ['EKD-018', 'EKD-999'] });
  });
  it('refuses a reply that is not the JSON asked for', () => {
    expect(parseModelReply('2,096 psia')).toEqual({ ok: false, error: 'The model reply was not the JSON object asked for.' });
    expect(parseModelReply('{"citations":[]}')).toEqual({ ok: false, error: 'The model reply has no answer text.' });
    expect(parseModelReply('')).toEqual({ ok: false, error: 'The model returned an empty reply.' });
  });
});

describe('the cap message', () => {
  it('names the organization cap and both counts', () => {
    expect(capMessage('organization', { callsToday: 200, userCallsToday: 12 })).toBe(
      'Organization cap reached: this organization has made 200 of its 200 helper calls for today (UTC), and you have made 12 of your 40. Both caps reset at 00:00 UTC; everything else in the AI Evaluation Studio works without the helper.',
    );
  });
  it('names the personal cap and both counts', () => {
    expect(capMessage('user', { callsToday: 57, userCallsToday: 40 })).toBe(
      'Personal cap reached: you have made 40 of your 40 helper calls for today (UTC), and your organization has made 57 of its 200. Both caps reset at 00:00 UTC; everything else in the AI Evaluation Studio works without the helper.',
    );
    expect(capMessage('user', { callsToday: 1, userCallsToday: 2, dailyCap: 3, userDailyCap: 2 })).toContain('you have made 2 of your 2');
    [capMessage('user', { callsToday: 1, userCallsToday: 1 }), capMessage('organization', { callsToday: 1, userCallsToday: 1 })]
      .forEach((m) => expect(m).not.toMatch(/[–—]/));
  });
});

describe('the model request', () => {
  const passages = [{ id: 'EKD-018', text: 'Average reservoir pressure 2,096 psia.' }];

  it('treats the gpt-5 and gpt-6 families and the o-series as reasoning models, and gpt-4o and gpt-4.1 as not', () => {
    ['gpt-6-luna', 'gpt-6', 'GPT-6-Luna', 'gpt-5', 'gpt-5-mini', 'gpt-5.1', 'o1', 'o3-mini', 'o4-mini'].forEach((m) => expect([m, isReasoningModel(m)]).toEqual([m, true]));
    ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-5-chat-latest', 'gpt-50', 'omni', '', 'luna'].forEach((m) => expect([m, isReasoningModel(m)]).toEqual([m, false]));
  });

  it('sends reasoning_effort and no temperature to a reasoning model', () => {
    const body = buildChatRequest('gpt-6-luna', 'pressure?', passages);
    expect(body).not.toHaveProperty('temperature');
    expect(body.reasoning_effort).toBe('low');
    expect(body.model).toBe('gpt-6-luna');
    expect(body.messages).toEqual([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt('pressure?', passages) },
    ]);
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: REPLY_SCHEMA });
    expect(buildChatRequest('o3-mini', 'q', passages, 'high').reasoning_effort).toBe('high');
  });

  it('keeps temperature 0 and sends no reasoning_effort to a non-reasoning model', () => {
    const body = buildChatRequest('gpt-4o-mini', 'pressure?', passages, 'high');
    expect(body.temperature).toBe(0);
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: REPLY_SCHEMA });
  });

  it('asks for the shape parseModelReply reads', () => {
    expect(REPLY_SCHEMA.strict).toBe(true);
    expect(REPLY_SCHEMA.schema.required).toEqual(['answer', 'citations']);
    expect(parseModelReply(JSON.stringify({ answer: 'x', citations: ['EKD-018'] }))).toEqual({ ok: true, answer: 'x', citations: ['EKD-018'] });
  });

  it('reads OPENAI_REASONING_EFFORT against the allowed list', () => {
    expect(REASONING_EFFORTS).toEqual(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
    expect(DEFAULT_REASONING_EFFORT).toBe('low');
    expect(resolveReasoningEffort(undefined)).toEqual({ effort: 'low', warning: null });
    expect(resolveReasoningEffort('  ')).toEqual({ effort: 'low', warning: null });
    REASONING_EFFORTS.forEach((e) => expect(resolveReasoningEffort(e)).toEqual({ effort: e, warning: null }));
    expect(resolveReasoningEffort(' XHigh ')).toEqual({ effort: 'xhigh', warning: null });
    expect(resolveReasoningEffort('minimal')).toEqual({
      effort: 'low', warning: 'OPENAI_REASONING_EFFORT is "minimal", which is not one of none, low, medium, high, xhigh, max; using low.',
    });
  });

  it('names an unsupported parameter in a provider 400', () => {
    const r = describeProviderError(400, JSON.stringify({ error: { message: "Unsupported parameter: 'temperature' is not supported with this model.", param: 'temperature' } }), 'gpt-6-luna');
    expect(r.unsupportedParameter).toBe(true);
    expect(r.error).toBe('provider 400 unsupported parameter: temperature');
    expect(r.log).toContain('OpenAI refused temperature for model gpt-6-luna (400 unsupported parameter)');
    const noParam = describeProviderError(400, JSON.stringify({ error: { message: "Unrecognized request argument supplied: 'reasoning_effort'" } }), 'gpt-4o-mini');
    expect(noParam.error).toBe('provider 400 unsupported parameter: reasoning_effort');
    const other = describeProviderError(429, 'rate limited', 'gpt-6-luna');
    expect(other).toEqual({ unsupportedParameter: false, log: 'OpenAI error 429 for model gpt-6-luna: rate limited', error: 'provider 429' });
    expect(describeProviderError(400, JSON.stringify({ error: { message: 'Invalid messages' } }), 'm').unsupportedParameter).toBe(false);
  });
});
