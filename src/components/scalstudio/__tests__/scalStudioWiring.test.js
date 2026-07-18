/**
 * SC3 — pure glue between string form state and the SCAL engine
 * (ScalStudioContext exported builders).
 */
import {
  buildOwParams,
  buildGoParams,
  buildReservoirProps,
  buildJSpec,
  DEFAULT_CURVES,
  DEFAULT_CAPILLARY,
} from '@/contexts/ScalStudioContext';

describe('buildOwParams / buildGoParams', () => {
  it('parses the default string state into valid params', () => {
    const ow = buildOwParams(DEFAULT_CURVES.ow);
    expect(ow.error).toBeNull();
    expect(ow.params).toMatchObject({ Swc: 0.2, Sor: 0.25, nw: 2.5 });
    const go = buildGoParams(DEFAULT_CURVES.go);
    expect(go.error).toBeNull();
    expect(go.params).toMatchObject({ Sgc: 0.05, Sorg: 0.15 });
  });

  it('surfaces the engine validator message on bad input', () => {
    const ow = buildOwParams({ ...DEFAULT_CURVES.ow, Swc: '0.7', Sor: '0.5' });
    expect(ow.params).toBeNull();
    expect(ow.error).toMatch(/mobile saturation/);
  });
});

describe('buildReservoirProps', () => {
  it('accepts the defaults and rejects broken rock', () => {
    expect(buildReservoirProps(DEFAULT_CAPILLARY.reservoir).error).toBeNull();
    expect(buildReservoirProps({ ...DEFAULT_CAPILLARY.reservoir, phi: '1.2' }).props).toBeNull();
  });
});

describe('buildJSpec', () => {
  it('manual mode returns the typed power law', () => {
    const { jSpec, error } = buildJSpec(DEFAULT_CAPILLARY, []);
    expect(error).toBeNull();
    expect(jSpec).toEqual({ type: 'power', a: 0.25, b: 1.4, Swirr: 0.15 });
  });

  it('manual mode rejects non-positive parameters', () => {
    const cap = { ...DEFAULT_CAPILLARY, manual: { a: '-1', b: '1', Swirr: '0.1' } };
    expect(buildJSpec(cap, []).error).toMatch(/positive/);
  });

  it('samples mode averages included samples and maps Swirr back to true Sw', () => {
    // Two identical power-law samples: the averaged fit must return the source.
    const truth = { a: 0.3, b: 1.5, Swirr: 0.1 };
    const jRows = [];
    for (let Sw = 0.2; Sw <= 0.9; Sw += 0.1) {
      const x = (Sw - truth.Swirr) / (1 - truth.Swirr);
      jRows.push({ Sw: Number(Sw.toFixed(2)), J: truth.a * Math.pow(x, -truth.b) });
    }
    const samples = [
      { id: 's1', name: 'A', jRows },
      { id: 's2', name: 'B', jRows },
    ];
    const cap = {
      ...DEFAULT_CAPILLARY,
      jMode: 'samples',
      includedSampleIds: ['s1', 's2'],
      SwirrOverride: '0.1',
    };
    const { jSpec, meta, error } = buildJSpec(cap, samples);
    expect(error).toBeNull();
    expect(meta.sampleCount).toBe(2);
    expect(jSpec.Swirr).toBe(0.1);
    // The averaging grid resamples the coarse 8-point tables by log-linear
    // interpolation before refitting, which biases a power law by a small
    // amount; 2% covers it (the SC2 engine suite pins the exact paths).
    expect(Math.abs(jSpec.a - truth.a) / truth.a).toBeLessThan(0.02);
    expect(Math.abs(jSpec.b - truth.b) / truth.b).toBeLessThan(0.02);
  });

  it('samples mode with nothing included asks for a sample or manual mode', () => {
    const cap = { ...DEFAULT_CAPILLARY, jMode: 'samples', includedSampleIds: [] };
    expect(buildJSpec(cap, []).error).toMatch(/at least one sample/);
  });
});
