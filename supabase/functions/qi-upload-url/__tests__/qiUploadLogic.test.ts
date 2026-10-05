/**
 * @jest-environment node
 */
// qi-upload-url logic (QI programme Q0). The presigner is gated on the worked
// example AWS publishes for SigV4 query authentication ("Authenticating
// Requests: Using Query Parameters", Example: GET Object), with a negative
// control, then the multipart plan and XML helpers.
import {
  presignUrl, uriEncode, partPlan, objectKeyFor, validateStart, validatePartNumbers,
  parseUploadId, parseListParts, xmlDecode, completeXml, checkPartsComplete, PART_SIZE, MAX_FILE_BYTES, MAX_SIGN_BATCH,
} from '../logic.ts';

const AWS_EXAMPLE = {
  method: 'GET',
  endpoint: 'https://examplebucket.s3.amazonaws.com',
  key: 'test.txt',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  expires: 86400,
  now: new Date('2013-05-24T00:00:00Z'),
};

describe('SigV4 query presigning', () => {
  test('reproduces the AWS published example signature exactly', async () => {
    const url = await presignUrl(AWS_EXAMPLE);
    expect(url).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt'
      + '?X-Amz-Algorithm=AWS4-HMAC-SHA256'
      + '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request'
      + '&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host'
      + '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  test('negative control: one character of the secret changes the signature', async () => {
    const url = await presignUrl({ ...AWS_EXAMPLE, secretAccessKey: AWS_EXAMPLE.secretAccessKey.replace(/Y$/, 'Z') });
    expect(url).not.toMatch(/aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404/);
  });

  test('path-style bucket and multipart query parameters are signed and sorted', async () => {
    const url = await presignUrl({
      ...AWS_EXAMPLE, endpoint: 'https://storage.petrolord.com', bucket: 'seismic-raw',
      key: 'u1/d1/file.sgy', method: 'PUT', query: { uploadId: 'abc==', partNumber: '7' },
    });
    const u = new URL(url);
    expect(u.pathname).toBe('/seismic-raw/u1/d1/file.sgy');
    const keys = [...u.searchParams.keys()];
    expect(keys.slice(0, -1)).toEqual([...keys.slice(0, -1)].sort());
    expect(u.searchParams.get('partNumber')).toBe('7');
    expect(url).toContain('uploadId=abc%3D%3D');
  });

  test('uriEncode follows RFC 3986 and keeps slashes only in paths', () => {
    expect(uriEncode('a b/c~d')).toBe('a%20b%2Fc~d');
    expect(uriEncode('a b/c', true)).toBe('a%20b/c');
    expect(uriEncode('é')).toBe('%C3%A9');
  });
});

describe('multipart plan and validation', () => {
  test('parts are 64 MiB with a short last part', () => {
    expect(partPlan(1)).toEqual({ partSize: PART_SIZE, parts: 1 });
    expect(partPlan(PART_SIZE)).toEqual({ partSize: PART_SIZE, parts: 1 });
    expect(partPlan(PART_SIZE + 1).parts).toBe(2);
    expect(partPlan(10 * 1024 ** 3).parts).toBe(160);
  });

  test('object keys stay inside the owner prefix whatever the file name', () => {
    expect(objectKeyFor('u1', 'd1', '../../etc/passwd')).toBe('u1/d1/passwd');
    expect(objectKeyFor('u1', 'd1', 'C:\\data\\F3 survey (full).sgy')).toBe('u1/d1/F3_survey_full_.sgy');
    expect(objectKeyFor('u1', 'd1', '...')).toBe('u1/d1/upload');
  });

  test('start requests are validated', () => {
    expect(validateStart({ filename: 'a.sgy', bytes: 10 })).toMatchObject({ ok: true, value: { name: 'a.sgy', organization_id: null } });
    expect(validateStart({ filename: '', bytes: 10 })).toMatchObject({ ok: false });
    expect(validateStart({ filename: 'a', bytes: 0 })).toMatchObject({ ok: false });
    expect(validateStart({ filename: 'a', bytes: 1.5 })).toMatchObject({ ok: false });
    expect(validateStart({ filename: 'a', bytes: MAX_FILE_BYTES + 1 })).toMatchObject({ ok: false });
  });

  test('part number requests are bounded', () => {
    expect(validatePartNumbers([1, 2, 2], 5)).toEqual([1, 2]);
    expect(validatePartNumbers([0], 5)).toMatch(/outside/);
    expect(validatePartNumbers([6], 5)).toMatch(/outside/);
    expect(validatePartNumbers([], 5)).toMatch(/non-empty/);
    expect(validatePartNumbers(Array.from({ length: MAX_SIGN_BATCH + 1 }, (_, i) => i + 1), 500)).toMatch(/at most/);
  });
});

describe('S3 multipart XML', () => {
  test('reads the upload id and the uploaded parts', () => {
    expect(parseUploadId('<InitiateMultipartUploadResult><Bucket>b</Bucket><UploadId>XyZ</UploadId></InitiateMultipartUploadResult>')).toBe('XyZ');
    const list = parseListParts('<ListPartsResult><IsTruncated>false</IsTruncated><Part><PartNumber>1</PartNumber><ETag>&quot;e1&quot;</ETag><Size>10</Size></Part><Part><PartNumber>2</PartNumber><ETag>"e2"</ETag><Size>4</Size></Part></ListPartsResult>');
    expect(list.parts).toEqual([{ partNumber: 1, etag: '"e1"', size: 10 }, { partNumber: 2, etag: '"e2"', size: 4 }]);
    expect(list.truncated).toBe(false);
  });

  test('ETags round-trip whichever entity form the server uses (SeaweedFS writes &#34;)', () => {
    const seaweed = parseListParts('<ListPartsResult><Part><PartNumber>1</PartNumber><ETag>&#34;eb4f&#34;</ETag><Size>1000</Size></Part></ListPartsResult>');
    expect(seaweed.parts[0].etag).toBe('"eb4f"');
    expect(completeXml(seaweed.parts)).toContain('<ETag>&quot;eb4f&quot;</ETag>');
    expect(xmlDecode('&#x22;a&amp;b&lt;&#39;')).toBe('"a&b<\'');
    expect(xmlDecode('&unknown;')).toBe('&unknown;');
  });

  test('complete body lists parts in order with escaped ETags', () => {
    expect(completeXml([{ partNumber: 2, etag: '"b"' }, { partNumber: 1, etag: '"a"' }]))
      .toBe('<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>&quot;a&quot;</ETag></Part><Part><PartNumber>2</PartNumber><ETag>&quot;b&quot;</ETag></Part></CompleteMultipartUpload>');
  });

  test('completion requires every part at its exact size', () => {
    const bytes = PART_SIZE * 2 + 5;
    const good = [{ partNumber: 1, size: PART_SIZE }, { partNumber: 2, size: PART_SIZE }, { partNumber: 3, size: 5 }];
    expect(checkPartsComplete(good, bytes)).toBeNull();
    expect(checkPartsComplete(good.slice(0, 2), bytes)).toMatch(/2 of 3/);
    expect(checkPartsComplete([good[0], { partNumber: 2, size: PART_SIZE - 1 }, good[2]], bytes)).toMatch(/Part 2/);
    expect(checkPartsComplete([good[0], good[0], good[2]], bytes)).toMatch(/Part 2 is missing/);
  });
});
