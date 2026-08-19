/**
 * Ingest-resume identity: the sampled-fingerprint plan (first / middle /
 * last 64 KiB, clamped and merged), the injectable-digest hashing over
 * exactly those bytes, and the resume gate that refuses the wrong file,
 * the wrong row state, and unverifiable pre-feature rows — the check
 * that stops a resume from interleaving bricks of two different files.
 */
import {
  SAMPLE_BYTES, FINGERPRINT_ALGO,
  fingerprintPlan, fileFingerprint, fingerprintsMatch, ingestRecord, resumeGate,
} from '@/pages/apps/Seismolord/services/ingestResume';

const KiB = 1024;

describe('fingerprintPlan', () => {
  test('large file: three disjoint 64 KiB windows at start / middle / end', () => {
    const size = 4 * 1024 * 1024 * KiB;   // 4 GiB
    const plan = fingerprintPlan(size);
    expect(plan).toEqual([
      { offset: 0, length: SAMPLE_BYTES },
      { offset: size / 2 - SAMPLE_BYTES / 2, length: SAMPLE_BYTES },
      { offset: size - SAMPLE_BYTES, length: SAMPLE_BYTES },
    ]);
  });

  test('small file degenerates to one whole-file window', () => {
    expect(fingerprintPlan(10 * KiB)).toEqual([{ offset: 0, length: 10 * KiB }]);
    expect(fingerprintPlan(SAMPLE_BYTES)).toEqual([{ offset: 0, length: SAMPLE_BYTES }]);
  });

  test('overlapping windows merge without gaps or double counting', () => {
    // 100 KiB: [0,64k), mid window [18k,82k), tail [36k,100k) — all overlap
    const plan = fingerprintPlan(100 * KiB);
    expect(plan).toEqual([{ offset: 0, length: 100 * KiB }]);
    // 160 KiB: [0,64k) and mid [48k,112k) merge; tail [96k,160k) merges too
    expect(fingerprintPlan(160 * KiB)).toEqual([{ offset: 0, length: 160 * KiB }]);
    // 512 KiB: three separate windows
    const p512 = fingerprintPlan(512 * KiB);
    expect(p512).toHaveLength(3);
    for (let i = 1; i < p512.length; i++) {
      expect(p512[i].offset).toBeGreaterThan(p512[i - 1].offset + p512[i - 1].length);
    }
  });

  test('empty / invalid sizes sample nothing', () => {
    expect(fingerprintPlan(0)).toEqual([]);
    expect(fingerprintPlan(NaN)).toEqual([]);
    expect(fingerprintPlan(-5)).toEqual([]);
  });
});

/** Minimal File stand-in: deterministic bytes, slice -> arrayBuffer. */
const fakeFile = (size, name = 'vol.sgy', byteAt = (i) => i % 251) => ({
  name,
  size,
  slice: (start, end) => ({
    arrayBuffer: async () => {
      const out = new Uint8Array(end - start);
      for (let i = 0; i < out.length; i++) out[i] = byteAt(start + i);
      return out.buffer;
    },
  }),
});

describe('fileFingerprint', () => {
  test('digest sees exactly the planned bytes, result carries algo/size/hex hash', async () => {
    const size = 512 * KiB;
    const file = fakeFile(size);
    let seen = null;
    const digest = async (bytes) => {
      seen = bytes;
      return new Uint8Array([0xab, 0x01]).buffer;
    };
    const fp = await fileFingerprint(file, digest);
    expect(fp).toEqual({ algo: FINGERPRINT_ALGO, size, hash: 'ab01' });

    const plan = fingerprintPlan(size);
    expect(seen.length).toBe(plan.reduce((n, w) => n + w.length, 0));
    // spot-check window boundaries landed in order
    expect(seen[0]).toBe(0 % 251);
    const midStart = plan[0].length;                       // first byte of window 2
    expect(seen[midStart]).toBe(plan[1].offset % 251);
    const tailStart = plan[0].length + plan[1].length;
    expect(seen[tailStart]).toBe(plan[2].offset % 251);
  });

  test('same content same hash; a middle-byte change flips it', async () => {
    const digest = async (bytes) => {
      // toy rolling hash — enough to prove sensitivity to sampled bytes
      let h = 7;
      for (const b of bytes) h = ((h * 31) + b) % 0xffff;
      return new Uint8Array([h >> 8, h & 0xff]).buffer;
    };
    const size = 512 * KiB;
    const a = await fileFingerprint(fakeFile(size), digest);
    const b = await fileFingerprint(fakeFile(size), digest);
    const mid = Math.floor(size / 2);
    const c = await fileFingerprint(
      fakeFile(size, 'other.sgy', (i) => (i === mid ? 99 : i % 251)), digest);
    expect(fingerprintsMatch(a, b)).toBe(true);
    expect(fingerprintsMatch(a, c)).toBe(false);
  });
});

describe('fingerprintsMatch', () => {
  const fp = { algo: FINGERPRINT_ALGO, size: 100, hash: 'aa' };
  test('strict on algo, size and hash; null-safe', () => {
    expect(fingerprintsMatch(fp, { ...fp })).toBe(true);
    expect(fingerprintsMatch(fp, { ...fp, size: 101 })).toBe(false);
    expect(fingerprintsMatch(fp, { ...fp, hash: 'ab' })).toBe(false);
    expect(fingerprintsMatch(fp, { ...fp, algo: 'sha1-v0' })).toBe(false);
    expect(fingerprintsMatch(fp, null)).toBe(false);
    expect(fingerprintsMatch(undefined, fp)).toBe(false);
  });
});

describe('resumeGate', () => {
  const fp = { algo: FINGERPRINT_ALGO, size: 1000, hash: 'aa' };
  const row = {
    name: 'Keta 3D',
    status: 'ingesting',
    survey_meta: {
      ingest: ingestRecord(fp, { ilByte: 9, xlByte: 21 }, { name: 'keta.sgy', size: 1000 }),
    },
  };

  test('happy path returns the ORIGINAL mapping (stored bytes win over the dialog)', () => {
    expect(resumeGate(row, { ...fp })).toEqual({ mapping: { ilByte: 9, xlByte: 21 } });
  });

  test('missing row / wrong status refuse', () => {
    expect(() => resumeGate(null, fp)).toThrow(/not found/i);
    expect(() => resumeGate({ ...row, status: 'ready' }, fp))
      .toThrow(/not an interrupted import.*ready/i);
  });

  test('pre-feature rows (no identity record) refuse with delete-and-reimport guidance', () => {
    expect(() => resumeGate({ ...row, survey_meta: null }, fp))
      .toThrow(/cannot be verified.*delete/is);
  });

  test('wrong file refuses loudly, naming the original and the mismatch kind', () => {
    expect(() => resumeGate(row, { ...fp, size: 2000 }))
      .toThrow(/sizes differ.*1,000.*2,000.*keta\.sgy/is);
    expect(() => resumeGate(row, { ...fp, hash: 'bb' }))
      .toThrow(/contents differ.*keta\.sgy/is);
  });

  test('ingestRecord snake_cases the mapping and captures file identity', () => {
    expect(row.survey_meta.ingest).toEqual({
      fingerprint: fp,
      mapping: { il_byte: 9, xl_byte: 21 },
      file_name: 'keta.sgy',
      file_size: 1000,
    });
  });
});
