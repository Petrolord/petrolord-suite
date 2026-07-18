# Well Test Analysis Studio — STATUS

Plan of record: `docs/scope/WellTestAnalysisStudio-PLAN.md` (approved 2026-07-18).
Replaces the archived mock Well Test Analyzer (slug `well-test-analyzer`,
tile archived by migration `20260717090000`; the mock code is deleted in WT2).

## Phase status

| Phase | Scope | Status |
|---|---|---|
| WT1 | Validated PTA core engine (no UI) | **DONE 2026-07-18** (this PR) |
| WT2 | Studio app: data/QC, diagnostics, match, specialized, report tabs; persistence; mock deletion | not started |
| WT3 | Model library (fractures, dual porosity, boundaries) + tile activation | not started |
| WT4 | Gas (pseudo-pressure), multi-rate, deliverability | not started |
| WT5 | PDF reporting, cross-app handoffs, e2e | not started |

## WT1 deliverables

Engines (`src/utils/welltest/`, pure JS, named exports, no React):
- `numerics.js` — Bessel I0/I1/K0/K1 (A&S polynomials + exp-scaled K
  variants), exponential integral E1, Gaver-Stehfest inversion.
- `lmFit.js` — Levenberg-Marquardt with numerical Jacobian, box bounds,
  covariance-based 95% confidence intervals; small dense linear solver.
- `models/homogeneous.js` — Laplace-space homogeneous model with constant
  wellbore storage and skin; effective-wellbore-radius mapping for negative
  skin; line-source and semilog asymptote references.
- `models/modelCatalog.js` — model registry with parameter metadata (units,
  bounds, log-scale) driving UI and fitting; oilfield dimensionless groups;
  drawdown/buildup evaluators (buildup by exact superposition).
- `superposition.js` — rate-step normalization, flow-period detection,
  Horner and Agarwal transforms, equivalent producing time, general
  variable-rate superposition.
- `derivative.js` — Bourdet derivative (L-window smoothing), log decimation,
  MAD spike trimming, slope-band flow-regime detection.
- `analysis.js` — MDH and Horner semilog analyses, Cartesian PSS (pore
  volume), sqrt-time fit, radius of investigation, skin pressure drop, flow
  efficiency.
- `autoFit.js` — LM auto-match on pressure + Bourdet derivative in log
  space; returns parameters with per-key confidence intervals.

Validation (`tools/validation/welltest/`, see its README):
- Independent Python stdlib oracle (integral-based Bessel, exact rational
  Stehfest weights) generating 143 committed goldens.
- Labeled-CASE harness `run-validation.mjs`: **38 checks, exit 0.**
- Literature hard gate CASE 7 armed with Lee (1982) Example 2.1: engine
  recovers k=48.04 md (book 48), skin=1.4301 (book 1.43), p*=1950.3 psig
  (book 1950).
- Jest: 112 tests in `src/utils/welltest/__tests__/` including synthetic
  round trips (MDH, Horner and auto-fit recover generating k, skin, C from
  clean and noisy data; auto-fit hits truth to ~1e-7 on clean fixtures).

## Gates before WT2 merges

1. Second literature fixture with a full published data table typed from
   the book (Dake Fundamentals Ch. 7 Horner example preferred, or the
   Earlougher/Ahmed 4900 STB/D, tp=310 hr buildup) added to
   `tools/validation/welltest/literature-fixtures.json` and green.
2. Live-DB check of legacy `pta_projects` (drop if empty, else decide with
   owner).

## Locked owner decisions (2026-07-18)

- Tile moves to Reservoir module, slug `well-test-analyzer` kept.
- Tile activation ships after WT3 with the carrying prod upload.
- Horizontal wells, limited entry, variable wellbore storage, multiphase
  Perrine, RTA, SI units: future scope outside this program.
