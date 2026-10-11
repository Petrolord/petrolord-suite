/**
 * @jest-environment node
 */
import { parseClient, consentUrl, parseRedirect, pkcePair, SCOPES } from '../lib/oauth.mjs';
import { createYouTubeClient } from '../lib/youtube.mjs';
import { parseEnv } from '../lib/supabase.mjs';
import crypto from 'crypto';

const client = parseClient({ installed: { client_id: 'cid', client_secret: 'sec', auth_uri: 'https://accounts.google.com/o/oauth2/auth', token_uri: 'https://oauth2.googleapis.com/token' } });

describe('oauth', () => {
  test('consent URL asks for the three YouTube scopes, offline access and PKCE on a loopback redirect', () => {
    const u = new URL(consentUrl({ client, redirectUri: 'http://127.0.0.1:8765/', state: 's1', challenge: 'ch' }));
    expect(u.searchParams.get('scope').split(' ')).toEqual([...SCOPES]);
    expect(SCOPES).toEqual([
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ]);
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:8765/');
    expect(u.toString()).not.toMatch(/sec/); // the client secret never goes in the URL
  });

  test('PKCE challenge is the S256 of the verifier', () => {
    const { verifier, challenge } = pkcePair();
    const expected = crypto.createHash('sha256').update(verifier).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(challenge).toBe(expected);
  });

  test('the pasted redirect gives the code; a wrong state, an error or junk is refused', () => {
    expect(parseRedirect('http://127.0.0.1:8765/?state=s1&code=4/abc&scope=x', 's1')).toBe('4/abc');
    expect(() => parseRedirect('http://127.0.0.1:8765/?state=zz&code=4/abc', 's1')).toThrow(/state/);
    expect(() => parseRedirect('http://127.0.0.1:8765/?error=access_denied', 's1')).toThrow(/access_denied/);
    expect(() => parseRedirect('not a url', 's1')).toThrow(/not a URL/);
  });

  test('a client file without a secret is refused', () => {
    expect(() => parseClient({ installed: { client_id: 'x' } })).toThrow();
  });
});

describe('youtube resumable upload', () => {
  test('sends chunks with content ranges, follows 308 ranges, returns the video', async () => {
    const size = 10;
    const calls = [];
    let acked = -1;
    const fetchImpl = async (url, opts) => {
      calls.push({ url, opts });
      if (opts.method === 'POST') return { ok: true, status: 200, headers: new Map([['location', 'https://upload/session']]), text: async () => '' };
      const [from, to] = opts.headers['content-range'].replace('bytes ', '').split('/')[0].split('-').map(Number);
      expect(from).toBe(acked + 1); // each chunk starts where the server said it stopped
      if (to === size - 1) return { ok: true, status: 201, headers: new Map(), json: async () => ({ id: 'vid1', status: { privacyStatus: 'private' } }) };
      acked = to;
      return { ok: false, status: 308, headers: new Map([['range', `bytes=0-${to}`]]), text: async () => '' };
    };
    const yt = createYouTubeClient({ getToken: async () => 'tok', fetchImpl, chunkSize: 4, fileSize: () => size, readChunk: async (_p, start, len) => Buffer.alloc(len, start) });
    const v = await yt.videosInsert({ filePath: '/x.mp4', resource: { snippet: { title: 't' }, status: { privacyStatus: 'private' } } });
    expect(v.id).toBe('vid1');
    const puts = calls.filter((c) => c.opts.method === 'PUT').map((c) => c.opts.headers['content-range']);
    expect(puts).toEqual(['bytes 0-3/10', 'bytes 4-7/10', 'bytes 8-9/10']);
    const post = calls.find((c) => c.opts.method === 'POST');
    expect(post.url).toMatch(/uploadType=resumable/);
    expect(post.opts.headers['x-upload-content-length']).toBe('10');
    expect(JSON.parse(post.opts.body).status.privacyStatus).toBe('private');
    expect(post.opts.headers.authorization).toBe('Bearer tok');
  });

  test('a failed API call throws with the status and message', async () => {
    const yt = createYouTubeClient({ getToken: async () => 'tok', fetchImpl: async () => ({ ok: false, status: 403, statusText: 'Forbidden', text: async () => JSON.stringify({ error: { message: 'quotaExceeded' } }) }) });
    await expect(yt.channelsMine()).rejects.toThrow(/403.*quotaExceeded/);
  });
});

test('env parsing reads keys and strips quotes', () => {
  expect(parseEnv('SUPABASE_URL="https://x.supabase.co"\n# c\nSUPABASE_SERVICE_ROLE_KEY=abc')).toEqual({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'abc' });
});
