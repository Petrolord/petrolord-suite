/**
 * The produced water studio's input parsing.
 *
 * `parseFloat` reads a prefix and throws the rest away, so a saved
 * study, a paste or a locale-formatted figure carrying "50,000" came
 * back as 50: the studio designed a train for fifty barrels a day and
 * reported 0.0015 ppm and a MEETS. And every box had a silent
 * fallback, so clearing the liner count gave ONE liner at 23.5 million
 * g rather than a refusal.
 */
import { num, findNumberFormatIssues, defaultInputs } from '@/contexts/ProducedWaterContext';
import {
  mediaFilter, flotation, DECLARED_CONSTANTS,
} from '@/utils/facilities/engine/producedWater';

describe('num: strict, and with no fallback', () => {
  it('reads a whole number and nothing else', () => {
    expect(num('50000')).toBe(50000);
    expect(num('0.5')).toBe(0.5);
    expect(num('.5')).toBe(0.5);
    expect(num('-2')).toBe(-2);
    expect(num('1e3')).toBe(1000);
    expect(num(' 12 ')).toBe(12);
    expect(num(42)).toBe(42);
  });

  it('refuses what parseFloat used to launder, every one of them', () => {
    const laundered = {
      '50,000': 50, '50 000': 50, '0.5.5': 0.5, '1/2': 1, '50000 bwpd': 50000, '12abc': 12,
    };
    Object.entries(laundered).forEach(([raw, old]) => {
      expect(parseFloat(raw)).toBe(old);          // what it used to do
      expect(Number.isNaN(num(raw))).toBe(true);  // what it does now
    });
  });

  it('has no fallback, so a cleared box reaches the engine as NaN', () => {
    expect(Number.isNaN(num(''))).toBe(true);
    expect(Number.isNaN(num('   '))).toBe(true);
    expect(Number.isNaN(num(undefined))).toBe(true);
    expect(Number.isNaN(num(null))).toBe(true);
    expect(Number.isNaN(num(Infinity))).toBe(true);
  });
});

describe('findNumberFormatIssues: which box, and what is in it', () => {
  it('finds nothing in the shipped defaults', () => {
    expect(findNumberFormatIssues(defaultInputs())).toEqual([]);
  });

  it('names the box and quotes what it holds', () => {
    const inputs = defaultInputs();
    inputs.water.flowBwpd = '50,000';
    inputs.filter.bedDepthM = '0.9m';
    const issues = findNumberFormatIssues(inputs);
    expect(issues).toEqual([
      { section: 'water', key: 'flowBwpd', raw: '50,000' },
      { section: 'filter', key: 'bedDepthM', raw: '0.9m' },
    ]);
  });

  it('leaves a cleared box alone: blank is a refusal, not a typo', () => {
    const inputs = defaultInputs();
    inputs.hydrocyclone.nLiners = '';
    expect(findNumberFormatIssues(inputs)).toEqual([]);
  });
});

describe('the shipped defaults sit where the engine can run them', () => {
  it('sizes the liner bank near its design point', () => {
    const d = defaultInputs();
    // 50,000 bwpd is 0.09201 m3/s; at 2.16 m3/h per liner the bank
    // needs about 154. It shipped 20, which is 7.667 times design.
    expect(num(d.hydrocyclone.nLiners)).toBe(160);
    const flowM3S = (num(d.water.flowBwpd) * 0.158987294928) / 86400;
    const perLiner = flowM3S / num(d.hydrocyclone.nLiners);
    const turndown = perLiner / (num(d.hydrocyclone.designFlowPerLinerM3H) / 3600);
    expect(turndown).toBeGreaterThan(0.5);
    expect(turndown).toBeLessThan(1.3);
  });

  it('does not ship a filter that trips its own loading warning', () => {
    const d = defaultInputs();
    const flowM3S = (num(d.water.flowBwpd) * 0.158987294928) / 86400;
    const loadingMHr = (flowM3S / num(d.filter.areaM2)) * 3600;
    expect(loadingMHr).toBeLessThan(25);
  });
});

/**
 * FC7-1 (engines #206). `mediaFilter` used to carry a silent
 * `Math.max(loadingMHr, 1)`, so below 1 m/hr the bed area moved the
 * answer by exactly nothing. The clamp is gone and the module now
 * refuses below a declared floor. These gates are about the SHIPPED
 * screen: the default must not land in the refusal region, the refusal
 * must arrive as a named error rather than a number, and the clamp
 * must not be able to come back unseen.
 */
describe('the filter loading floor, on the shipped screen', () => {
  const flowOf = (d) => (num(d.water.flowBwpd) * 0.158987294928) / 86400;
  const runFilter = (d, areaM2) => mediaFilter({
    flowM3S: flowOf(d),
    areaM2,
    bedDepthM: num(d.filter.bedDepthM),
    mediaMicron: num(d.filter.mediaMicron),
    filterCoefficientPerM: num(d.filter.filterCoefficientPerM),
  });

  it('ships a bed that loads well above the declared floor', () => {
    const d = defaultInputs();
    const loadingMHr = (flowOf(d) / num(d.filter.areaM2)) * 3600;
    // read the floor from the engine, never restate it here
    expect(loadingMHr).toBeGreaterThan(DECLARED_CONSTANTS.filterMinLoadingMHr);
    const r = runFilter(d, num(d.filter.areaM2));
    expect(r.error).toBeUndefined();
    expect(r.d50cMicron).toBeGreaterThan(0);
  });

  it('refuses under the floor BY NAME, rather than returning a number', () => {
    const d = defaultInputs();
    // a bed far larger than the shipped one takes this flow under the floor
    const areaAtFloorM2 = (flowOf(d) * 3600) / DECLARED_CONSTANTS.filterMinLoadingMHr;
    const r = runFilter(d, areaAtFloorM2 * 2);
    expect(typeof r.error).toBe('string');
    expect(r.d50cMicron).toBeUndefined();
    expect(r.error).toContain(String(DECLARED_CONSTANTS.filterMinLoadingMHr));
    expect(r.loadingFloorMHr).toBe(DECLARED_CONSTANTS.filterMinLoadingMHr);
    expect(r.areaAtFloorM2).toBeCloseTo(areaAtFloorM2, 6);
  });

  it('no longer freezes the answer across a whole span of bed area', () => {
    // THE DEFECT, and the negative control for this gate. Under the old
    // clamp these four beds, spanning a hundredfold in area, all came
    // back with a filter coefficient of 11.067972 per m and a cut of
    // 5.275789 micron, to every digit. Above the floor the clamp was
    // the identity, so only the region it froze can discriminate: this
    // gate fails against the clamped engine because that one answered
    // here, with the same number every time.
    const d = defaultInputs();
    const areaAtFloorM2 = (flowOf(d) * 3600) / DECLARED_CONSTANTS.filterMinLoadingMHr;
    const areas = [areaAtFloorM2 * 2, areaAtFloorM2 * 6, areaAtFloorM2 * 20, areaAtFloorM2 * 200];
    const runs = areas.map((a) => runFilter(d, a));
    runs.forEach((r) => {
      expect(typeof r.error).toBe('string');
      expect(r.d50cMicron).toBeUndefined();
    });
    // and the refusal is not one canned sentence either: each one
    // quotes the loading THAT bed would actually run at
    const quoted = new Set(runs.map((r) => r.error));
    expect(quoted.size).toBe(areas.length);
    runs.forEach((r, k) => {
      expect(r.loadingMHr).toBeCloseTo((flowOf(d) / areas[k]) * 3600, 12);
    });
  });

  it('lets a bigger bed cut finer wherever it still answers', () => {
    const d = defaultInputs();
    const areaAtFloorM2 = (flowOf(d) * 3600) / DECLARED_CONSTANTS.filterMinLoadingMHr;
    const small = runFilter(d, areaAtFloorM2 / 10);
    const big = runFilter(d, areaAtFloorM2 * 0.999);
    expect(small.error).toBeUndefined();
    expect(big.error).toBeUndefined();
    // a bigger bed loads slower, captures more per metre and cuts finer
    expect(big.filterCoefficientPerM).toBeGreaterThan(small.filterCoefficientPerM);
    expect(big.d50cMicron).toBeLessThan(small.d50cMicron);
  });

  it('carries the floor and the flotation threshold out to the app', () => {
    const d = defaultInputs();
    expect(runFilter(d, num(d.filter.areaM2)).loadingFloorMHr)
      .toBe(DECLARED_CONSTANTS.filterMinLoadingMHr);
    const f = flotation({
      flowM3S: flowOf(d),
      cellVolumeM3: num(d.flotation.cellVolumeM3),
      nCells: num(d.flotation.nCells),
      cellDepthM: num(d.flotation.cellDepthM),
      gasRatio: num(d.flotation.gasRatio),
      bubbleMicron: num(d.flotation.bubbleMicron),
      rhoWater: 1050, rhoOil: 850, muPaS: 0.00065,
    });
    expect(f.error).toBeUndefined();
    expect(f.residenceWarnS).toBe(DECLARED_CONSTANTS.flotationResidenceWarnS);
    // the shipped cells sit far above the threshold, so no warning
    expect(f.residenceS).toBeGreaterThan(DECLARED_CONSTANTS.flotationResidenceWarnS);
  });
});
