# Parked close-outs (Economics E5) — status

Phase: Economics E5 (Economics-ROADMAP.md §6 E5)
Status: **SHIPPED 2026-08-29** (branch feat/economics-e5)

The items the D series left parked, plus the ones the E series turned up
along the way. Three closed, two stated honestly as still open, and one
record correction that was itself a defect.

## 1. Raw Monte Carlo sample export (parked at D2)

D2 shipped probabilistic EPE and parked "raw-sample export for
auditors". A percentile nobody can check is a claim rather than a
result, so this closes it.

`runEpeMonteCarlo` now records one row per iteration: the values drawn,
and the NPV, IRR and payback the fiscal engine returned for them. The
rows include the iterations where IRR or payback does not exist, which
the percentile arrays deliberately drop, because the count of undefined
runs is itself a result.

The sample travels to the caller and is **not stored**. Persisting five
thousand rows on every saved run would bloat `epe_mc_runs` for a file
most runs never need, and a seeded run is reproducible without it. The
edge function strips it before the insert and returns it alongside the
results, so the export is available for the run you just made and not
for one reloaded from history; the panel only offers the button when it
has the rows.

Gated by five tests, the most useful being that **the reported
percentiles can be re-derived from the exported sample**, which is the
whole point of handing it to an auditor.

Edge function `epe-monte-carlo` redeployed (script 164.2 kB); the
persisted payload is unchanged.

## 2. Portfolio correlation (parked at D4)

The portfolio risk roll-up treated projects as strictly independent,
which is the most flattering assumption a portfolio can be given:
independent risks cancel, so the spread narrows and the chance of an
overall loss looks small. Real projects sharing a basin, a partner, a
rig contract or a price deck lose together.

`portfolioRiskMetrics` now takes an average pairwise correlation. Under
equal correlation the variance is

    Var = sum_i var_i + rho * ( (sum_i sd_i)^2 - sum_i var_i )

which collapses to the independent sum at rho = 0, so **the previous
behaviour is exactly the default**, and reaches `(sum sd_i)^2` at
rho = 1, where diversification buys nothing. Means are untouched:
correlation moves the spread, never the expectation.

A single average figure is as much precision as a screening tool can
honestly ask for; a full matrix is more than anyone has at this stage,
and the help guide says so. The results panel reports what independence
would have said alongside the correlated figure, so the cost of the
assumption is visible rather than buried.

Ten tests, including the two limits above, monotonicity in rho, the
clamp on nonsense values, and that a single project is unaffected
because it has nothing to correlate with.

## 3. pdfBrand consolidation (parked at D5)

D5 extracted RC Pro's report banner into `src/lib/pdfBrand.js` and left
RC Pro's own copy in place "to avoid disturbing its export test suite".
The fork is gone: `ReportGenerator.jsx` deletes its `fitText`,
`loadPetrolordLogo` and `drawBrandHeader` and imports the shared module.

**RC Pro's export test suite passes unchanged**, which was the concern
that parked this. Three new tests in that suite pin the banner text, so
a future change to the shared module cannot alter every Suite report's
header silently.

## 4. The record correction

The E5 sweep of EPE's open items found the app **understating itself**,
which is the same failure as overstating and is just as misleading.

`EpeHelpGuide` told users, under "What the Studio does not do (yet)",
that it could not:

- apply the minimum effective tax rate of NTA section 57, "which is not
  implemented in the engine" — it shipped in Wave F, is gated by a jest
  case, and its checkbox sits in the Run Console on the same screen;
- support per-year price decks — Wave B;
- run incremental with-versus-without economics — Wave F.

`docs/scope/EPE.md` carried the same stale claim in §4.2 and marked min
ETR "✗ Math not implemented" in its validation table.

Both are corrected, and the min-ETR entry now says what it actually is:
a **project-level approximation**, because the statutory test is
company-level against NGN turnover thresholds a project model cannot
see. That is why the top-up is reported on its own line where a reviewer
can strip it. The help guide now carries that caveat, and the related
one that JV and PSC arithmetic is validated against hand-derived
closed-form cases rather than traced to a published worked example, as
the PIA 2021 math is.

## 5. Still open, and why

These were folded into E5 by the roadmap. They are not closed, and this
records precisely what each needs rather than leaving them as a list of
words.

- **Literature byte-verification of the JV and PSC math** against
  published worked examples (Mian; SPE). **Blocked on owner-provided
  PDFs.** The existing cases are independently hand-derived and
  regression-gated, which is real validation but not literature tracing,
  and the app now says so.
- **Domestic market obligation.** Needs a fiscal design decision before
  any code: which price basis the obligation is settled at, and whether
  the shortfall is a volume diversion or a price haircut. Implementing
  it on a guess would produce exactly the kind of authoritative-looking
  arithmetic this programme has spent five phases removing.
- **Carried interests, promote and back-in.** Same reason: the terms
  vary per agreement and the engine would need a carry model, not a
  parameter. Correctly listed in the help guide as planned.
- **Monthly evaluation.** The engine is annual end to end, including the
  fiscal year logic, allowance caps and carryforwards. Moving to monthly
  periods is a change to every one of those, not a resolution setting.
- **In-app editing of uploaded production and cost data (§4.10).** A
  product feature, not an engine one. The help guide now states the
  current path plainly: corrections are made by re-uploading.

## Verification

- Jest **392 suites / 5553 tests green**; `npm run build` clean.
- Edge function `epe-monte-carlo` redeployed.
- No migration in this phase.
