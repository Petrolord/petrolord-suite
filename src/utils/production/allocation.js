// Production allocation analytics (P3, Production Allocation Studio).
// Pure functions over the po_* spine rows — no Supabase, no React. The
// context wires these to the studio UI.
//
// The problem: a facility meters one commingled stream, so the volumes
// booked against each well are an ALLOCATION, not a measurement. Back
// allocation distributes the metered total across the wells in
// proportion to what each was capable of producing over the period —
// its latest valid well test, scaled by the hours it was actually on.
//
//   theoretical(well, day) = test rate x uptime fraction
//   factor(phase, day)     = metered total / sum of theoretical
//   allocated(well, day)   = theoretical x factor
//
// A factor of 1.0 means the wells' tests add up to exactly what the
// facility measured. Persistently high or low factors mean the tests,
// the meter or the uptime record disagree, which is the signal an
// allocation engineer works from — so nothing here silently normalizes
// a factor to 1.
//
// Units are the ledger convention throughout: liquids stb, gas Mscf,
// rates stb/d and Mscf/d.

const MS_DAY = 24 * 60 * 60 * 1000;

const dayNumber = (isoDate) => Math.round(new Date(`${isoDate}T00:00:00Z`).getTime() / MS_DAY);

const median = (values) => {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

/** First of the month for an ISO date, as an ISO date. */
export const monthKey = (isoDate) => `${String(isoDate).slice(0, 7)}-01`;

export const PHASES = [
  { key: 'oil', label: 'Oil', unit: 'stb', rateKey: 'oil_rate_stbd', ledgerKey: 'oil_stb', totalKey: 'oil_stb' },
  { key: 'water', label: 'Water', unit: 'stb', rateKey: 'water_rate_stbd', ledgerKey: 'water_stb', totalKey: 'water_stb' },
  { key: 'gas', label: 'Gas', unit: 'Mscf', rateKey: 'gas_rate_mscfd', ledgerKey: 'gas_mscf', totalKey: 'gas_mscf' },
];

export const DEFAULT_ALLOCATION_SETTINGS = {
  basis: 'test',           // 'test' = well test x uptime, 'ledger' = per-well meter proration
  maxTestAgeDays: 180,     // a test older than this no longer carries its well
  useUptime: true,         // scale the test rate by hours_on / 24
  defaultHours: 24,        // hours assumed for a ledger row with no hours_on
  includeInvalidTests: false, // tests failing QC are excluded by default
  factorWarnLow: 0.7,      // factors outside this band are flagged, never clamped
  factorWarnHigh: 1.3,
};

export const DEFAULT_TEST_QC_SETTINGS = {
  minDurationHours: 4,      // shorter tests rarely reach stable flow
  outlierPct: 50,           // deviation from the well's own test history, %
  ledgerTolerancePct: 30,   // deviation from the ledger rate on the test date, %
  watercutTolerancePts: 10, // deviation from the ledger watercut, percentage points
};

// ---- test selection --------------------------------------------------------

/**
 * Group tests by well id, each list date-ascending. Invalid tests are
 * dropped unless includeInvalid is set (the QC flag is the P3 studio's
 * own verdict, so honoring it here is what makes QC mean something).
 */
export function groupTests(tests, { includeInvalid = false } = {}) {
  const byWell = new Map();
  (tests || []).forEach((t) => {
    if (!t?.well_id || !t.test_date) return;
    if (!includeInvalid && t.is_valid === false) return;
    if (!byWell.has(t.well_id)) byWell.set(t.well_id, []);
    byWell.get(t.well_id).push(t);
  });
  byWell.forEach((list) => list.sort((a, b) => (a.test_date < b.test_date ? -1 : 1)));
  return byWell;
}

/**
 * The test that carries a well on `date`: the most recent one on or
 * before it, within maxTestAgeDays. Returns null when the well has no
 * test in force, which excludes it from that day's allocation rather
 * than assuming a rate for it.
 */
export function testInForce(wellTests, date, maxTestAgeDays = DEFAULT_ALLOCATION_SETTINGS.maxTestAgeDays) {
  if (!wellTests || !wellTests.length) return null;
  const day = dayNumber(date);
  let chosen = null;
  for (const t of wellTests) {
    if (dayNumber(t.test_date) > day) break;
    chosen = t;
  }
  if (!chosen) return null;
  if (Number.isFinite(maxTestAgeDays) && maxTestAgeDays > 0
    && day - dayNumber(chosen.test_date) > maxTestAgeDays) return null;
  return chosen;
}

// ---- allocation ------------------------------------------------------------

const emptyPhases = () => ({ oil: 0, water: 0, gas: 0 });

/**
 * Back-allocate metered field totals across the wells, day by day.
 *
 * Only dates carrying a metered total are allocated; a date with no
 * total is not invented. Injectors and observation wells never take a
 * share of produced volumes.
 *
 * @param {{wells: Array, tests: Array, ledger: Array, totals: Array,
 *   settings: object}} input
 * @returns {{days: Array, wells: Array, totals: object, diagnostics: Array,
 *   settings: object}}
 */
export function computeAllocation({ wells = [], tests = [], ledger = [], totals = [], settings = {} } = {}) {
  const s = { ...DEFAULT_ALLOCATION_SETTINGS, ...settings };
  const producers = wells.filter((w) => w.well_type !== 'injector' && w.well_type !== 'observation');
  const testsByWell = groupTests(tests, { includeInvalid: s.includeInvalidTests });

  // ledger lookup: wellId -> date -> row
  const ledgerByWell = new Map();
  (ledger || []).forEach((r) => {
    const id = r.well_id || r.well?.id;
    if (!id || !r.prod_date) return;
    if (!ledgerByWell.has(id)) ledgerByWell.set(id, new Map());
    ledgerByWell.get(id).set(r.prod_date, r);
  });

  const diagnostics = [];
  const days = [];
  const perWell = new Map();
  const grand = {
    measured: emptyPhases(), theoretical: emptyPhases(), allocated: emptyPhases(), days: 0,
  };

  const sortedTotals = [...(totals || [])]
    .filter((t) => t?.total_date)
    .sort((a, b) => (a.total_date < b.total_date ? -1 : 1));

  sortedTotals.forEach((total) => {
    const date = total.total_date;
    const measured = {
      oil: total.oil_stb || 0,
      water: total.water_stb || 0,
      gas: total.gas_mscf || 0,
    };

    const entries = [];
    producers.forEach((w) => {
      const ledgerRow = ledgerByWell.get(w.id)?.get(date) || null;
      const hours = Number.isFinite(ledgerRow?.hours_on) ? ledgerRow.hours_on : s.defaultHours;
      const uptime = s.useUptime ? Math.max(0, Math.min(24, hours)) / 24 : 1;

      if (s.basis === 'ledger') {
        // Proration on the wells' own meters: the ledger IS the split,
        // reconciled to the facility total.
        if (!ledgerRow) return;
        entries.push({
          wellId: w.id,
          wellName: w.name,
          uptime,
          testId: null,
          testDate: null,
          theoretical: {
            oil: ledgerRow.oil_stb || 0,
            water: ledgerRow.water_stb || 0,
            gas: ledgerRow.gas_mscf || 0,
          },
        });
        return;
      }

      const test = testInForce(testsByWell.get(w.id), date, s.maxTestAgeDays);
      if (!test) {
        diagnostics.push({
          date, wellId: w.id, wellName: w.name, code: 'no_test_in_force', severity: 'medium',
          message: `${w.name} has no valid test within ${s.maxTestAgeDays} days of ${date} and takes no allocation.`,
        });
        return;
      }
      entries.push({
        wellId: w.id,
        wellName: w.name,
        uptime,
        testId: test.id,
        testDate: test.test_date,
        theoretical: {
          oil: (test.oil_rate_stbd || 0) * uptime,
          water: (test.water_rate_stbd || 0) * uptime,
          gas: (test.gas_rate_mscfd || 0) * uptime,
        },
      });
    });

    const theoretical = emptyPhases();
    entries.forEach((e) => {
      theoretical.oil += e.theoretical.oil;
      theoretical.water += e.theoretical.water;
      theoretical.gas += e.theoretical.gas;
    });

    const factors = {};
    PHASES.forEach(({ key }) => {
      if (theoretical[key] > 0) {
        factors[key] = measured[key] / theoretical[key];
      } else {
        factors[key] = null;
        if (measured[key] > 0) {
          diagnostics.push({
            date, code: 'no_basis', severity: 'high',
            message: `${date}: ${measured[key].toLocaleString()} ${key === 'gas' ? 'Mscf' : 'stb'} of ${key} measured with no well capable of carrying it. Nothing allocated.`,
          });
        }
      }
      if (factors[key] != null && (factors[key] < s.factorWarnLow || factors[key] > s.factorWarnHigh)) {
        diagnostics.push({
          date, code: 'factor_out_of_band', severity: 'medium', phase: key, value: factors[key],
          message: `${date}: ${key} factor ${factors[key].toFixed(2)} is outside the ${s.factorWarnLow} to ${s.factorWarnHigh} band.`,
        });
      }
    });

    const allocated = emptyPhases();
    entries.forEach((e) => {
      e.allocated = {
        oil: factors.oil == null ? 0 : e.theoretical.oil * factors.oil,
        water: factors.water == null ? 0 : e.theoretical.water * factors.water,
        gas: factors.gas == null ? 0 : e.theoretical.gas * factors.gas,
      };
      allocated.oil += e.allocated.oil;
      allocated.water += e.allocated.water;
      allocated.gas += e.allocated.gas;

      if (!perWell.has(e.wellId)) {
        perWell.set(e.wellId, {
          wellId: e.wellId,
          wellName: e.wellName,
          days: 0,
          theoretical: emptyPhases(),
          allocated: emptyPhases(),
        });
      }
      const agg = perWell.get(e.wellId);
      agg.days += 1;
      PHASES.forEach(({ key }) => {
        agg.theoretical[key] += e.theoretical[key];
        agg.allocated[key] += e.allocated[key];
      });
    });

    days.push({ date, measured, theoretical, allocated, factors, entries });
    grand.days += 1;
    PHASES.forEach(({ key }) => {
      grand.measured[key] += measured[key];
      grand.theoretical[key] += theoretical[key];
      grand.allocated[key] += allocated[key];
    });
  });

  const wellRows = [...perWell.values()].sort(
    (a, b) => b.allocated.oil - a.allocated.oil || String(a.wellName).localeCompare(String(b.wellName)),
  );

  return { days, wells: wellRows, totals: grand, diagnostics, settings: s };
}

/**
 * Volume-weighted monthly factors per well, the po_allocation_factors
 * shape. A well's monthly factor is its allocated volume over its
 * theoretical volume for that month, so it carries the mix of days the
 * well was actually on. Months where a well had no theoretical volume
 * for a phase carry a factor of 1 for that phase (nothing to scale)
 * rather than a divide by zero.
 */
export function monthlyFactors(allocation) {
  const byKey = new Map();
  (allocation?.days || []).forEach((day) => {
    const month = monthKey(day.date);
    day.entries.forEach((e) => {
      const key = `${e.wellId}|${month}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          wellId: e.wellId,
          wellName: e.wellName,
          periodMonth: month,
          theoretical: emptyPhases(),
          allocated: emptyPhases(),
        });
      }
      const agg = byKey.get(key);
      PHASES.forEach(({ key: p }) => {
        agg.theoretical[p] += e.theoretical[p];
        agg.allocated[p] += e.allocated[p];
      });
    });
  });

  return [...byKey.values()]
    .map((r) => ({
      ...r,
      factors: {
        oil: r.theoretical.oil > 0 ? r.allocated.oil / r.theoretical.oil : 1,
        water: r.theoretical.water > 0 ? r.allocated.water / r.theoretical.water : 1,
        gas: r.theoretical.gas > 0 ? r.allocated.gas / r.theoretical.gas : 1,
      },
    }))
    .sort((a, b) => (a.periodMonth < b.periodMonth ? -1 : a.periodMonth > b.periodMonth ? 1
      : String(a.wellName).localeCompare(String(b.wellName))));
}

/**
 * Allocated volumes in the daily-ledger shape, ready to be written back
 * to po_daily_production with source 'allocation'. hours_on is carried
 * through from the uptime that produced the split, so the ledger stays
 * self-consistent.
 */
export function allocatedLedgerRows(allocation) {
  const rows = [];
  (allocation?.days || []).forEach((day) => {
    day.entries.forEach((e) => {
      rows.push({
        wellId: e.wellId,
        date: day.date,
        oil_stb: e.allocated.oil,
        water_stb: e.allocated.water,
        gas_mscf: e.allocated.gas,
        hours_on: allocation.settings?.useUptime ? e.uptime * 24 : null,
      });
    });
  });
  return rows;
}

/**
 * Imbalance between the metered total and the wells' own ledger for
 * each allocated date — the unaccounted volume an allocation engineer
 * chases. Positive means the meter saw more than the wells booked.
 */
export function imbalanceSeries(allocation, ledger) {
  const byDate = new Map();
  (ledger || []).forEach((r) => {
    if (!r.prod_date) return;
    if (!byDate.has(r.prod_date)) byDate.set(r.prod_date, emptyPhases());
    const d = byDate.get(r.prod_date);
    d.oil += r.oil_stb || 0;
    d.water += r.water_stb || 0;
    d.gas += r.gas_mscf || 0;
  });

  return (allocation?.days || []).map((day) => {
    const booked = byDate.get(day.date) || emptyPhases();
    const out = { date: day.date, factors: day.factors };
    PHASES.forEach(({ key }) => {
      out[key] = {
        measured: day.measured[key],
        booked: booked[key],
        imbalance: day.measured[key] - booked[key],
        imbalancePct: booked[key] > 0 ? ((day.measured[key] - booked[key]) / booked[key]) * 100 : null,
      };
    });
    return out;
  });
}

// ---- well test QC ----------------------------------------------------------

export const TEST_ISSUES = {
  zero_rate: { label: 'No flow', description: 'The test recorded no oil, water or gas.' },
  short_duration: { label: 'Short test', description: 'Below the minimum duration for stabilized flow.' },
  rate_outlier: { label: 'Rate outlier', description: 'Oil rate is far from the well’s own test history.' },
  ledger_mismatch: { label: 'Ledger mismatch', description: 'Test rate disagrees with the ledger rate on the test date.' },
  watercut_mismatch: { label: 'Watercut mismatch', description: 'Test watercut disagrees with the ledger on the test date.' },
  no_ledger: { label: 'No ledger row', description: 'Nothing in the daily ledger for the test date.' },
};

const SEVERITY_RANK = { high: 0, medium: 1, info: 2 };

/**
 * Data QC over a field's well tests. Every check is against data the
 * spine already holds — the well's own test history and the daily
 * ledger on the test date — so the verdict never depends on a well
 * model that does not exist yet.
 *
 * @param {Array} tests po_well_tests rows (well attached or well_id set)
 * @param {Array} wellSeries buildWellSeries output (utils/production/surveillance)
 * @returns {Array<{testId, wellId, wellName, testDate, severity, issues}>}
 */
export function validateWellTests(tests, wellSeries = [], settings = {}) {
  const s = { ...DEFAULT_TEST_QC_SETTINGS, ...settings };
  const pointsByWell = new Map();
  (wellSeries || []).forEach(({ well, points }) => {
    const byDate = new Map();
    points.forEach((p) => byDate.set(p.date, p));
    pointsByWell.set(well.id, byDate);
  });
  const nameById = new Map((wellSeries || []).map(({ well }) => [well.id, well.name]));

  const byWell = new Map();
  (tests || []).forEach((t) => {
    if (!t?.well_id) return;
    if (!byWell.has(t.well_id)) byWell.set(t.well_id, []);
    byWell.get(t.well_id).push(t);
  });
  byWell.forEach((list) => list.sort((a, b) => (a.test_date < b.test_date ? -1 : 1)));

  const results = [];
  byWell.forEach((list, wellId) => {
    list.forEach((t, i) => {
      const issues = [];
      const oil = t.oil_rate_stbd || 0;
      const water = t.water_rate_stbd || 0;
      const gas = t.gas_rate_mscfd || 0;

      if (oil + water + gas <= 0) {
        issues.push({ code: 'zero_rate', severity: 'high', message: 'The test recorded no flow at all.' });
      }
      if (Number.isFinite(t.duration_hours) && t.duration_hours < s.minDurationHours) {
        issues.push({
          code: 'short_duration', severity: 'medium',
          message: `${t.duration_hours} h test, under the ${s.minDurationHours} h minimum for stabilized flow.`,
        });
      }

      // Against the well's own history: the median of its earlier tests.
      const priorOil = list.slice(0, i).map((p) => p.oil_rate_stbd || 0).filter((v) => v > 0);
      if (priorOil.length >= 3 && oil > 0) {
        const base = median(priorOil);
        const dev = Math.abs((oil - base) / base) * 100;
        if (dev >= s.outlierPct) {
          issues.push({
            code: 'rate_outlier', severity: dev >= s.outlierPct * 2 ? 'high' : 'medium',
            message: `Oil ${Math.round(oil).toLocaleString()} stb/d is ${Math.round(dev)}% off this well's ${Math.round(base).toLocaleString()} stb/d test median.`,
          });
        }
      }

      // Against the ledger on the test date (producing-day basis, so a
      // part-day test is compared like for like).
      const point = pointsByWell.get(wellId)?.get(t.test_date);
      if (!point) {
        issues.push({ code: 'no_ledger', severity: 'info', message: 'No daily ledger row on the test date to cross-check against.' });
      } else {
        const ledgerOil = Number.isFinite(point.oilPd) ? point.oilPd : point.oil;
        if (oil > 0 && Number.isFinite(ledgerOil) && ledgerOil > 0) {
          const dev = Math.abs((oil - ledgerOil) / ledgerOil) * 100;
          if (dev >= s.ledgerTolerancePct) {
            issues.push({
              code: 'ledger_mismatch', severity: dev >= s.ledgerTolerancePct * 2 ? 'high' : 'medium',
              message: `Test oil ${Math.round(oil).toLocaleString()} stb/d against ${Math.round(ledgerOil).toLocaleString()} stb/d in the ledger, ${Math.round(dev)}% apart.`,
            });
          }
        }
        const testWatercut = oil + water > 0 ? water / (oil + water) : null;
        if (testWatercut != null && point.watercut != null) {
          const pts = Math.abs(testWatercut - point.watercut) * 100;
          if (pts >= s.watercutTolerancePts) {
            issues.push({
              code: 'watercut_mismatch', severity: 'medium',
              message: `Test watercut ${(testWatercut * 100).toFixed(0)}% against ${(point.watercut * 100).toFixed(0)}% in the ledger.`,
            });
          }
        }
      }

      if (!issues.length) return;
      const severity = issues.reduce(
        (worst, is) => (SEVERITY_RANK[is.severity] < SEVERITY_RANK[worst] ? is.severity : worst),
        'info',
      );
      results.push({
        testId: t.id,
        wellId,
        wellName: t.well?.name || nameById.get(wellId) || 'Unknown well',
        testDate: t.test_date,
        severity,
        issues,
      });
    });
  });

  return results.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || (a.testDate < b.testDate ? 1 : -1));
}
