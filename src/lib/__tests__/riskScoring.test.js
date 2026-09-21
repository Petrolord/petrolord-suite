/**
 * AS2 — the risk scoring authority.
 *
 * The Assurance module had no tests of any kind before this file.
 *
 * Two of these describe blocks are ordinary unit tests. The third is the
 * one that matters: a guard that fails if a second copy of the 5x5
 * thresholds appears anywhere in the module again. Four copies had
 * already accumulated, and they disagreed (see the header of
 * src/lib/riskScoring.js), so a test that only checks the authority
 * would have passed happily while the table page painted a score of 15
 * green.
 */
import fs from 'fs';
import path from 'path';
import {
  APPETITE,
  NO_BAND,
  RISK_BANDS,
  calculateResidualScore,
  calculateRiskScore,
  countByBand,
  deriveRiskFields,
  getAppetiteStatus,
  getHeatmapCellClasses,
  getRiskBand,
  getRiskBandClasses,
  getRiskBandColor,
  isReviewOverdue,
} from '../riskScoring';

describe('risk score', () => {
  it('is likelihood times impact across the whole 5x5 matrix', () => {
    for (let l = 1; l <= 5; l += 1) {
      for (let i = 1; i <= 5; i += 1) {
        expect(calculateRiskScore(l, i)).toBe(l * i);
      }
    }
  });

  it('accepts the numeric strings a <select> hands back', () => {
    expect(calculateRiskScore('4', '4')).toBe(16);
  });

  it('refuses a level off the scale rather than scoring it', () => {
    // The old implementation returned 0 for anything non-numeric via
    // `Number(x) || 0`, but happily multiplied a 9 by a 9 into an 81
    // that lands in no band at all.
    expect(calculateRiskScore(9, 9)).toBe(0);
    expect(calculateRiskScore(0, 3)).toBe(0);
    expect(calculateRiskScore(-1, 3)).toBe(0);
    expect(calculateRiskScore(null, 3)).toBe(0);
    expect(calculateRiskScore(undefined, undefined)).toBe(0);
    expect(calculateRiskScore('high', 3)).toBe(0);
  });
});

describe('bands', () => {
  it.each([
    [25, 'Critical'], [16, 'Critical'], [15, 'Critical'],
    [14, 'High'], [12, 'High'], [10, 'High'],
    [9, 'Medium'], [6, 'Medium'], [5, 'Medium'],
    [4, 'Low'], [2, 'Low'], [1, 'Low'],
    [0, NO_BAND],
  ])('scores %i as %s', (score, band) => {
    expect(getRiskBand(score)).toBe(band);
  });

  it('puts 15 in Critical, which the table page used to paint green', () => {
    // RiskRegisterTablePage used `risk.risk_score > 15`, so a 3x5 risk
    // was the one score in the matrix that two screens disagreed about.
    expect(getRiskBand(15)).toBe('Critical');
    expect(getRiskBandClasses(15)).toBe(getRiskBandClasses(16));
  });

  it('covers every score the 5x5 matrix can produce, with no gaps', () => {
    const reachable = new Set();
    for (let l = 1; l <= 5; l += 1) {
      for (let i = 1; i <= 5; i += 1) reachable.add(l * i);
    }
    reachable.forEach((score) => {
      expect(getRiskBand(score)).not.toBe(NO_BAND);
    });
  });

  it('bands are contiguous and non-overlapping', () => {
    const sorted = [...RISK_BANDS].sort((a, b) => a.min - b.min);
    sorted.forEach((b, idx) => {
      expect(b.min).toBeLessThanOrEqual(b.max);
      if (idx > 0) expect(b.min).toBe(sorted[idx - 1].max + 1);
    });
  });

  it('the heatmap cell and the badge agree for every cell', () => {
    for (let l = 1; l <= 5; l += 1) {
      for (let i = 1; i <= 5; i += 1) {
        const band = getRiskBand(calculateRiskScore(l, i));
        expect(getHeatmapCellClasses(l, i)).toContain(
          { Critical: 'red', High: 'orange', Medium: 'yellow', Low: 'green' }[band],
        );
      }
    }
  });

  it('gives an unknown band the muted colour rather than throwing', () => {
    expect(getRiskBandColor('Nonsense')).toBe('hsl(var(--muted))');
  });
});

describe('residual risk', () => {
  it('is the inherent score until a residual position is assessed', () => {
    expect(calculateResidualScore({ likelihood: 4, impact: 4 })).toBe(16);
  });

  it('uses the residual pair once it is set', () => {
    expect(calculateResidualScore({
      likelihood: 4, impact: 4, residual_likelihood: 2, residual_impact: 3,
    })).toBe(6);
  });

  it('falls back per axis, not all or nothing', () => {
    // Mitigation that reduces likelihood but not impact is the common
    // case, and it must not silently reset impact to 1.
    expect(calculateResidualScore({
      likelihood: 5, impact: 4, residual_likelihood: 2,
    })).toBe(8);
  });

  it('treats a residual of zero as unassessed rather than as safe', () => {
    expect(calculateResidualScore({ likelihood: 4, impact: 4, residual_likelihood: 0 }))
      .toBe(0);
    expect(getRiskBand(0)).toBe(NO_BAND);
  });
});

describe('appetite', () => {
  it('says nothing when no target is set', () => {
    expect(getAppetiteStatus({ likelihood: 5, impact: 5 })).toBe(APPETITE.NOT_SET);
  });

  it('is within appetite when residual meets the target exactly', () => {
    expect(getAppetiteStatus({
      likelihood: 5, impact: 5, residual_likelihood: 2, residual_impact: 3, target_score: 6,
    })).toBe(APPETITE.WITHIN);
  });

  it('is above appetite when residual exceeds the target', () => {
    expect(getAppetiteStatus({
      likelihood: 5, impact: 5, residual_likelihood: 3, residual_impact: 3, target_score: 6,
    })).toBe(APPETITE.ABOVE);
  });

  it('judges the RESIDUAL score, not the inherent one', () => {
    // A risk mitigated down to 4 against a target of 6 is within
    // appetite even though it started at 25. Judging the inherent score
    // would report every well-controlled risk as a breach.
    expect(getAppetiteStatus({
      likelihood: 5, impact: 5, residual_likelihood: 2, residual_impact: 2, target_score: 6,
    })).toBe(APPETITE.WITHIN);
  });

  it('does not report a pass for a risk that has no score at all', () => {
    expect(getAppetiteStatus({ target_score: 6 })).toBe(APPETITE.NOT_SET);
  });
});

describe('review dates', () => {
  const asOf = new Date('2026-09-16T12:00:00Z');

  it('a risk with no review date is not overdue', () => {
    expect(isReviewOverdue({}, asOf)).toBe(false);
  });

  it('a review due today is not yet overdue', () => {
    expect(isReviewOverdue({ next_review_date: '2026-09-16' }, asOf)).toBe(false);
  });

  it('yesterday is overdue', () => {
    expect(isReviewOverdue({ status: 'Open', next_review_date: '2026-09-15' }, asOf)).toBe(true);
  });

  it('only a live risk is review-overdue (engines #212, ASC-0 RC-2)', () => {
    ['Closed', 'Draft'].forEach((status) => {
      expect(isReviewOverdue({ status, next_review_date: '2026-09-15' }, asOf)).toBe(false);
    });
  });

  it('tomorrow is not', () => {
    expect(isReviewOverdue({ next_review_date: '2026-09-17' }, asOf)).toBe(false);
  });

  it('an unparseable date is not silently treated as overdue', () => {
    expect(isReviewOverdue({ next_review_date: 'soon' }, asOf)).toBe(false);
  });
});

describe('derived fields written on save', () => {
  it('rating always matches the stored inherent score', () => {
    const d = deriveRiskFields({ likelihood: 4, impact: 4 });
    expect(d.inherentScore).toBe(16);
    expect(d.rating).toBe('Critical');
    expect(d.rating).toBe(getRiskBand(d.inherentScore));
  });

  it('reports inherent and residual separately', () => {
    const d = deriveRiskFields({
      likelihood: 5, impact: 5, residual_likelihood: 2, residual_impact: 2, target_score: 6,
    });
    expect(d.inherentScore).toBe(25);
    expect(d.inherentBand).toBe('Critical');
    expect(d.residualScore).toBe(4);
    expect(d.residualBand).toBe('Low');
    expect(d.appetite_status).toBe(APPETITE.WITHIN);
  });
});

describe('counts', () => {
  const risks = [
    { likelihood: 4, impact: 4 },                                        // 16 Critical
    { likelihood: 3, impact: 3 },                                        // 9  Medium
    { likelihood: 5, impact: 2 },                                        // 10 High
    { likelihood: 4, impact: 2, residual_likelihood: 1, residual_impact: 1 }, // 8 High -> 1 Low
  ];

  it('counts inherent bands', () => {
    expect(countByBand(risks)).toEqual({
      Critical: 1, High: 1, Medium: 2, Low: 0, [NO_BAND]: 0,
    });
  });

  it('counts residual bands differently, which is the point of them', () => {
    expect(countByBand(risks, { residual: true })).toEqual({
      Critical: 1, High: 1, Medium: 1, Low: 1, [NO_BAND]: 0,
    });
  });

  it('every risk lands in exactly one band', () => {
    const total = Object.values(countByBand(risks)).reduce((a, b) => a + b, 0);
    expect(total).toBe(risks.length);
  });
});

describe('GUARD: there is only one scoring authority', () => {
  const ROOT = path.resolve(__dirname, '../../..');
  const AUTHORITY = path.join('src', 'lib', 'riskScoring.js');

  // Scan code, not prose. Without this the guard reads its own
  // explanatory comments as offenders, and worse, it would let a real
  // one hide inside a commented-out block.
  const codeOf = (file) =>
    fs.readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const walk = (dir, out = []) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '__tests__') return;
        walk(full, out);
      } else if (/\.(js|jsx)$/.test(e.name)) {
        out.push(full);
      }
    });
    return out;
  };

  // Everything that reads or renders a risk_register row.
  const scanned = [
    path.join(ROOT, 'src', 'pages', 'apps', 'risk-register'),
    path.join(ROOT, 'src', 'lib'),
  ]
    .filter((d) => fs.existsSync(d))
    .flatMap((d) => walk(d))
    .concat([path.join(ROOT, 'src', 'hooks', 'useAssuranceHub.js'),
      path.join(ROOT, 'src', 'pages', 'dashboard', 'AssuranceHub.jsx')])
    .filter((f) => fs.existsSync(f))
    .filter((f) => !f.endsWith(AUTHORITY));

  it('scans a non-empty set of files, or it proves nothing', () => {
    expect(scanned.length).toBeGreaterThan(5);
  });

  it.each([
    ['15', /(?:score|risk_score|rating)\s*[><]=?\s*15/],
    ['10', /(?:score|risk_score|rating)\s*[><]=?\s*10/],
    ['5', /(?:score|risk_score|rating)\s*[><]=?\s*5\b/],
  ])('no file restates the %s threshold', (_label, pattern) => {
    const offenders = scanned.filter((f) => pattern.test(codeOf(f)));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('no file outside the authority names a band with its own colour map', () => {
    const offenders = scanned.filter((f) => {
      const src = codeOf(f);
      return /case\s+'Critical'/.test(src) || /Critical:\s*'bg-/.test(src);
    });
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('the hub does not prefer a stored rating over the computed band', () => {
    // AS11 moved the hub's logic into src/lib/assuranceHub.js.
    const hub = path.join(ROOT, 'src', 'lib', 'assuranceHub.js');
    const src = codeOf(hub);
    // `r.rating || (...)` trusted a text column the app never wrote.
    expect(src).not.toMatch(/\.rating\s*\|\|/);
    expect(src).toMatch(/riskScoring/);
  });
});
