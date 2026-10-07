import { waveletText, runRecord, compactParams, fingerprint, RUN_RECORD_CONTRACT } from '../services/handover';

test('wavelet text: header lines, centred time, every sample', () => {
  const t = waveletText({ name: 'Field wavelet', dtMs: 2, samples: [0, 0.5, 1, 0.5, 0], source: 'average of A, B' });
  const lines = t.trim().split('\n');
  expect(lines[0]).toBe('# Petrolord QI Studio wavelet: Field wavelet');
  expect(lines.filter((l) => !l.startsWith('#'))).toEqual(['-4.000 0.0000000', '-2.000 0.50000000', '0.000 1.0000000', '2.000 0.50000000', '4.000 0.0000000']);
  expect(() => waveletText({ name: 'x', dtMs: 0, samples: [1] })).toThrow();
});

test('run record: settings with long arrays fingerprinted, outputs, checks, engine commit', () => {
  const lnAi = Array.from({ length: 300 }, (_, i) => (i % 7 ? 8.5 + i / 1000 : null));
  const job = {
    id: 'j1', kind: 'poststack_inversion', status: 'succeeded', engine_commit: 'suite-a+engines-b', finished_at: 'T',
    params: { mode: 'volume', inversion: { method: 'model_based', wells: [{ name: 'A', il: 1, xl: 2, ln_ai: lnAi }], wavelet: { samples: [1, 2, 3], dt_ms: 4 } } },
    result_refs: { volume_id: 'v1', settings: { method: 'model_based' }, blind: [{ name: 'A', blind: { corr: 0.9 } }] },
  };
  const r = runRecord(job, { build: 'b1', now: 'N' });
  expect(r.contract).toBe(RUN_RECORD_CONTRACT);
  expect(r.job).toMatchObject({ id: 'j1', kind: 'poststack_inversion', engine_commit: 'suite-a+engines-b' });
  expect(r.settings.inversion.wells[0].ln_ai).toEqual({ values: 300, fingerprint: fingerprint(JSON.stringify(lnAi)) });
  expect(r.settings.inversion.wavelet.samples).toEqual([1, 2, 3]); // short arrays kept
  expect(r.outputs.volume_ids).toEqual({ volume: 'v1' });
  expect(r.checks.blind[0].name).toBe('A');
  // negative control: a changed log changes its fingerprint
  const other = lnAi.slice(); other[10] = 9;
  expect(compactParams(other).fingerprint).not.toBe(r.settings.inversion.wells[0].ln_ai.fingerprint);
  expect(() => runRecord(null)).toThrow();
});
