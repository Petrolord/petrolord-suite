/**
 * @jest-environment node
 */
/**
 * EPE Edge Function request handling (2026-10-14): a malformed body used to
 * come back as HTTP 500 with the JavaScript stack in the reply. It is now
 * HTTP 400 with one plain sentence; no error reply carries a stack.
 */
import { readJsonObject, requireIds, errorResponse, errorStatus, EpeBadRequest } from '../epe-request.ts';

const req = (body: string) => new Request('http://x/fn', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
const cors = { 'Access-Control-Allow-Origin': '*' };

describe('epe-request', () => {
  it('a body that is not JSON is a 400 with a plain message and no stack', async () => {
    let err: unknown = null;
    try { await readJsonObject(req('{not json')); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(EpeBadRequest);
    const res = errorResponse(err, cors, 'Engine failed.');
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ error: 'The request body must be JSON.' });
    expect(JSON.stringify(json)).not.toMatch(/stack|at \w+ \(/);
  });
  it('JSON that is not an object, and missing ids, are 400s that name the ids', async () => {
    await expect(readJsonObject(req('[1,2]'))).rejects.toThrow('The request body must be a JSON object.');
    const body = await readJsonObject(req('{"run_id":"r1"}'));
    let err: unknown = null;
    try { requireIds(body, ['run_id', 'run_config_id']); } catch (e) { err = e; }
    expect(errorStatus(err)).toBe(400);
    expect((err as Error).message).toBe('Missing run_config_id.');
    expect(() => requireIds({ run_id: 'r', run_config_id: 'c' }, ['run_id', 'run_config_id'])).not.toThrow();
  });
  it('an engine failure stays a 500 and keeps its message, without the stack (negative control)', async () => {
    const res = errorResponse(new Error('Ingestion validation failed: no oil column.'), cors, 'Engine failed.');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Ingestion validation failed: no oil column.' });
  });
});
