import { signV4, r2Config } from '../lib/r2.mjs';

// AWS SigV4 test suite, case "get-vanilla"
const AWS = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', region: 'us-east-1', service: 'service', now: new Date('2015-08-30T12:36:00Z') };

test('signature matches the AWS get-vanilla reference', () => {
  const h = signV4({ ...AWS, method: 'GET', url: 'https://example.amazonaws.com/' });
  expect(h['x-amz-date']).toBe('20150830T123600Z');
  expect(h.authorization).toBe('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
});

test('negative control: a different secret gives a different signature', () => {
  const a = signV4({ ...AWS, method: 'GET', url: 'https://example.amazonaws.com/' });
  const b = signV4({ ...AWS, secretAccessKey: 'x', method: 'GET', url: 'https://example.amazonaws.com/' });
  expect(a.authorization).not.toBe(b.authorization);
});

test('signed headers include the ones passed in, sorted, and host is not sent', () => {
  const h = signV4({ ...AWS, method: 'PUT', url: 'https://example.amazonaws.com/b/k.mp4', headers: { 'X-Amz-Content-Sha256': 'abc', 'Content-Type': 'video/mp4' } });
  expect(h.authorization).toContain('SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date,');
  expect(h.host).toBeUndefined();
});

test('config needs all four values', () => {
  expect(r2Config({ R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b', R2_SECRET_ACCESS_KEY: 'c' })).toBeNull();
  expect(r2Config({ R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b', R2_SECRET_ACCESS_KEY: 'c', R2_BUCKET: 'd' }).endpoint).toBe('https://a.r2.cloudflarestorage.com');
});
