// PT7: the scan-read client maps gateway statuses to kinds the dialog can
// phrase and normalises the proposal. The supabase client is a stub.

import { readScan, ScanReadError, kindForStatus, SCAN_READ_FUNCTION } from '../services/scanRead';

const IMG = 'data:image/png;base64,AAAA';
const clientWith = (result) => ({ functions: { invoke: jest.fn(async () => result) } });
const httpError = (status, body) => ({
  message: `Edge Function returned a non-2xx status code`,
  context: { status, json: async () => body },
});

test('a good reply returns the parsed proposal plus model and prompt version', async () => {
  const client = clientWith({
    data: { proposal: { mnemonic: 'gr', value_left: 0, value_right: '150', depth_unit: 'm' }, model: 'gpt-4o-mini', prompt_version: 1, usage: { total_tokens: 900 } },
    error: null,
  });
  const r = await readScan(client, { image: IMG, hints: { mnemonic: 'GR' } });
  expect(client.functions.invoke).toHaveBeenCalledWith(SCAN_READ_FUNCTION, { body: { image: IMG, hints: { mnemonic: 'GR' } } });
  expect(r.proposal).toMatchObject({ mnemonic: 'GR', value_left: 0, value_right: 150, depth_unit: 'm' });
  expect(r.model).toBe('gpt-4o-mini');
  expect(r.prompt_version).toBe(1);
  expect(r.usage.total_tokens).toBe(900);
});

test('statuses map to kinds and the server detail wins over the canned message', async () => {
  expect(kindForStatus(401)).toBe('auth');
  expect(kindForStatus(413)).toBe('too-large');
  expect(kindForStatus(503)).toBe('not-configured');
  expect(kindForStatus(502)).toBe('upstream');
  expect(kindForStatus(400)).toBe('bad-request');
  expect(kindForStatus(500)).toBe('failed');
  await expect(readScan(clientWith({ data: null, error: httpError(503, { error: 'set the OPENAI_API_KEY secret' }) }), { image: IMG }))
    .rejects.toMatchObject({ kind: 'not-configured', message: 'set the OPENAI_API_KEY secret' });
  const e = await readScan(clientWith({ data: null, error: { message: 'Failed to send a request', context: null } }), { image: IMG }).catch((x) => x);
  expect(e).toBeInstanceOf(ScanReadError);
  expect(e.kind).toBe('failed');
  expect(e.message).toMatch(/unavailable/);
});

test('a non-image payload and a data.error reply are refused before or after transport', async () => {
  const client = clientWith({ data: { error: 'nope' }, error: null });
  await expect(readScan(client, { image: 'hello' })).rejects.toMatchObject({ kind: 'bad-request' });
  expect(client.functions.invoke).not.toHaveBeenCalled();
  await expect(readScan(client, { image: IMG })).rejects.toMatchObject({ kind: 'failed', message: 'nope' });
});
