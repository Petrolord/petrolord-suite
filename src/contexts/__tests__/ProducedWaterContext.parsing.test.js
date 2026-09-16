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
