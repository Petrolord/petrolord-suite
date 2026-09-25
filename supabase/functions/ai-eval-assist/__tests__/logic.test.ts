// ai-eval-assist pure half (AI Evaluation Studio, Data & AI D5): the request
// rules, the prompt, the reply parser and the metering constants. The studio
// side (src/utils/dataAi/evalAssist.js) must state the same cap.
import fs from 'fs';
import path from 'path';
import {
  DAILY_CAP, DEFAULT_MODEL, MAX_PASSAGES, SYSTEM_PROMPT, buildUserPrompt, capMessage, parseModelReply, validateRequest,
} from '../logic.ts';
import { ASSIST_DAILY_CAP, ASSIST_DEFAULT_MODEL, ASSIST_FUNCTION } from '../../../../src/utils/dataAi/evalAssist.js';
import { ASSIST_MAX_PASSAGES } from '../../../../src/utils/dataAi/evalWorkflows.js';

const ORG = '10000000-0000-4000-8000-000000000001';
const ok = { organization_id: ORG, query: 'reservoir pressure at flood start', passages: [{ id: 'EKD-018', text: 'Average reservoir pressure 2,096 psia on 2023-01-01.' }] };

describe('the metering constants', () => {
  it('match the studio and the help guide', () => {
    expect(DAILY_CAP).toBe(50);
    expect(ASSIST_DAILY_CAP).toBe(DAILY_CAP);
    expect(ASSIST_DEFAULT_MODEL).toBe(DEFAULT_MODEL);
    expect(ASSIST_MAX_PASSAGES).toBe(MAX_PASSAGES);
    expect(ASSIST_FUNCTION).toBe('ai-eval-assist');
    expect(capMessage()).toBe('This organization has used its 50 helper calls for today (UTC). The cap resets at 00:00 UTC; everything else in the AI Evaluation Studio works without the helper.');
  });

  it('reserves through the metering function with the cap, before the model runs, and logs failures as errors', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');
    const reserve = src.indexOf("admin.rpc('dai_llm_reserve_call'");
    const model = src.indexOf("fetch('https://api.openai.com/v1/chat/completions'");
    expect(reserve).toBeGreaterThan(0);
    expect(model).toBeGreaterThan(reserve);
    expect(src).toContain('p_cap: DAILY_CAP');
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
