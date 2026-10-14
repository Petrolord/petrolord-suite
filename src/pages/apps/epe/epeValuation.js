// How a run's NPV is dated (owner decision 2026-10-14, option A; engine
// 3.12.3). The valuation date is 31 December of the valuation year: on end of
// year discounting each year's cash is placed at its year end, so the
// valuation year's own cash is undiscounted; on mid-year discounting cash is
// placed at mid-year, half a year before the year end. One home for the
// wording, so the Results Viewer, the PDF, Compare Runs, the value per barrel
// card and the Run Console say the same thing.

/** The valuation year a run was struck at: kpis.valuation_year, else the config's valuation or base year. */
export function valuationYearOf(kpis, config) {
  const k = Number(kpis?.valuation_year);
  if (Number.isFinite(k) && k > 0) return k;
  for (const v of [config?.valuation_year, config?.base_year]) {
    const n = parseInt(String(v ?? ''), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** 'valued at 31 Dec 2026' (null when the year is not known). */
export const valuedAtText = (year) => (year ? `valued at 31 Dec ${year}` : null);

/** 'end-year discounting' or 'mid-year discounting'. */
export const conventionText = (convention) => (convention === 'mid_year' ? 'mid-year discounting' : 'end-year discounting');

/** The Run Console help under the convention select. */
export const CONVENTION_HELP = 'The NPV is valued at 31 December of the valuation year. End of year places each year\'s cash at its year end; mid-year places it at mid-year, half a year before the year end, so mid-year discounts it less.';
