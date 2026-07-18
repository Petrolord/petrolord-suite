# Well Test Analysis Studio — STATUS

Plan of record: `docs/scope/WellTestAnalysisStudio-PLAN.md` (approved 2026-07-18).
Replaces the archived mock Well Test Analyzer (slug `well-test-analyzer`,
tile archived by migration `20260717090000`; the mock code is deleted in WT2).

## Phase status

| Phase | Scope | Status |
|---|---|---|
| WT1 | Validated PTA core engine (no UI) | **DONE 2026-07-18** (PR #101) |
| WT2 | Studio app: data/QC, diagnostics, match, specialized, report tabs; persistence; mock deletion | **DONE 2026-07-18** (PR #102) |
| WT3 | Model library (fractures, dual porosity, boundaries) + tile activation | **DONE 2026-07-18** (PR #103; tile migration staged, deploy-gated) |
| WT4 | Gas (pseudo-pressure), multi-rate, deliverability | **DONE 2026-07-18** (PR #104) |
| WT5 | PDF reporting, cross-app handoffs, e2e | **DONE 2026-07-18** (this PR) — **PROGRAM COMPLETE** |

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

## WT2 deliverables (2026-07-18)

Studio app (`src/pages/apps/WellTestAnalysisStudio.jsx` +
`src/contexts/WellTestStudioContext.jsx` + `src/components/welltest/`) on
the shared Studio shell kit, five tabs (Data | Diagnostics | Match |
Specialized | Report), driven only by the WT1 engines:
- Data: gauge CSV import (papaparse), MAD spike trim, log-cycle
  decimation, rate-history flow periods, analysis-period selection.
- Diagnostics: Bourdet log-log with smoothing control, regime flags,
  plateau kh readout. White chartTheme + ChartFrame watermark throughout.
- Match: catalog-metadata sliders, LM auto-fit with 95% CIs, tri-plot.
- Specialized: Horner / MDH / sqrt-t / Cartesian PSS straight lines.
- Report: consolidated results with CIs, notes, JSON export.
- Fluid Systems Studio PVT intake via the navigate-state contract (Bo, mu).
- Persistence: `createSavedProjectsService('saved_well_test_projects')`,
  inputs only, results recomputed on load. Migration `20260718160000`
  applied live 2026-07-18 (dry run + anon RLS probes green, MIGRATIONS.md).
- Mock deleted: `WellTestDataAnalyzer.jsx`, `WellTestAnalyzerGuide.jsx`,
  `src/components/welltestanalyzer/`, `wellTestCalculations.js`; old
  production route redirects to the studio.
- Jest: 13 new tests (wiring + five-tab smoke on the sample buildup).

## WT2 gates (both closed 2026-07-18)

1. Second literature fixture: **armed and green.** Ahmed, Reservoir
   Engineering Handbook 4th ed., Example 6-26 / Table 6-5 (Earlougher
   1977, SPE Monograph 5): full 31-row published table typed verbatim
   from the book PDF; harness recovers k=13.0 md (book 12.8), skin=8.79
   (book 8.6), m=39.4 psi/cycle (book 40), p1hr=3265.7 psig (book 3266)
   regressing over the book's straight-line window (dt >= 1.05 hr).
   Harness total now 42 checks, exit 0. (Book typo documented in the
   fixture: Step 3 arithmetic prints 0.22 cp against the given mu_o=0.20.)
2. Legacy `pta_*` live check: **done.** `pta_files`/`pta_runs`/
   `pta_telemetry` empty; `pta_projects` holds 2 identical rows of the
   mock's hardcoded output (kh 123.4 / skin 5.6 / Pi 3510, both from the
   owner's own support/test accounts, March 2026). Rows exist, so per the
   locked decision the family stayed read-only pending owner approval.
   **RESOLVED 2026-07-18: owner approved the drop; the 4-table family was
   dropped live by migration `20260718210000` (WT4 branch), 2 mock rows
   discarded.**

## WT3 deliverables (2026-07-18)

Model library (all validated before UI exposure, CASE 8 of the harness):
- `models/radial.js`: generalized radial sandface: homogeneous or
  Warren-Root dual porosity (PSS and transient-slab f(u), `dualPorosity.js`)
  crossed with the boundary family: single sealing fault and
  constant-pressure boundary (image line sources), centered channel
  (image series), closed circle (van Everdingen-Hurst in scaled Bessel
  form). Storage + skin applied through the universal Laplace composition
  (verified identical to the WT1 homogeneous formula to ~1e-10).
- `models/fracture.js`: Gringarten uniform-flux / infinite-conductivity
  vertical fracture (plane-source K0-integral Laplace form, 0.732 point)
  and Cinco-Ley finite-conductivity fracture (discretized fracture-flow /
  plane-source system, 12 graded segments).
- `numerics.js` additions: scaled I0e/I1e, K0 integral F(x).
- Catalog: 10 metadata-driven entries; per-model `toDimless` mappings;
  skin bounded at zero outside plain homogeneous (additive Laplace skin
  is only physical for S >= 0; stimulated vertical wells use homogeneous
  or a fracture model).
- UI: match/report tables and working-match state fully metadata-driven
  (model switching seeds defaults; auto-fit writes back every parameter),
  per-model guidance in the help drawer, constant-pressure regime flag.
- Validation: oracle extensions incl. a REAL-TIME erf+E1 route for the
  Gringarten fracture (independent of the JS Laplace/Stehfest route),
  140 new goldens, jest `wt3Models.test.js` (11 tests incl. auto-fit
  round trips recovering L, xf, omega/lambda), harness CASE 8 with 23
  analytic literature truths (Gringarten sqrt(pi t) + 2.80907/2.2
  constants, Cinco-Ley 2.451 FcD^-1/2 t^1/4 + FcD->inf convergence,
  Warren-Root lines + dip, fault E1 image identity + derivative
  doubling, channel half slope, closed-circle exact PSS line,
  constant-pressure ln(2LD) stabilization). **Harness total: 65/65.**
- Tile activation migration `20260718200000` staged and dry-run
  verified, NOT applied (deploy-gated: ships with the prod upload that
  carries the studio). SPA alias route `apps/reservoir/well-test-analyzer`
  added.
- Documented deviation from the plan text: the closed system ships as a
  closed circle (exact van Everdingen-Hurst solution) rather than a
  closed rectangle (2D image lattice); rectangle stays future scope.

## WT4 deliverables (2026-07-18)

Gas, injection/falloff and multi-rate (validated in CASE 9 before UI
exposure; harness total 81/81):
- `gas.js`: pseudo-pressure m(p) by trapezoid on a PVT table (Papay z and
  Lee-Gonzalez-Eakin viscosity twins of the Fluid Systems Studio
  correlations, pinned bit-identical by jest, or a laboratory table),
  inverse transform, gas compressibility from the z table, normalized
  pseudo-time, gas MDH/Horner through the exact equivalent-FVF identity
  (141.2 q Beq mu_i = 1422 q T, verified to 3e-4), and deliverability:
  Rawlins-Schellhardt C-and-n plus Houpeurt LIT with AOF.
- `analysis.js`: Odeh-Jones multi-rate superposition semilog analysis
  (harness round trip recovers k and skin to 0.02% from exactly
  superposed variable-rate data).
- Studio: fluid selector runs the whole pipeline in m(p) space through an
  analysis-space transform in prepareTestData; injection and falloff
  mirror onto the drawdown/buildup machinery; deliverability card and
  test-point editor on the Specialized tab; multi-rate card when the rate
  history has more than one flowing rate; deliverability inputs persist
  with the project payload.
- Literature gates (typed verbatim from the Ahmed REH 4th ed. PDF):
  Example 6-7 pseudo-pressure table and printed Qg (book quirks
  documented), Example 8-2 three-method deliverability with printed
  coefficients and AOFs (graphical-vs-least-squares tolerances
  documented). Jest: 137 welltest tests across 12 suites.
- Cleanup: legacy `pta_*` 4-table family dropped live (owner approved;
  migration `20260718210000`, MIGRATIONS.md).
- Out of WT4 scope, documented: pseudo-time is engine-level only (not yet
  wired as a diagnostics abscissa option); PSS pore volume stays a liquid
  drawdown analysis.

## WT5 deliverables (2026-07-18)

- PDF report export (`src/utils/wellTestReportExport.js`, jsPDF +
  autotable like the other Suite exports): headline results, model match
  with 95% CIs, straight-line analyses, deliverability, flow regimes and
  interpretation notes; pure formatting, nothing recomputed.
- Result handoffs on the Report tab (navigate-state contract): average
  pressure (p* when available, else pi) + k + skin to Reservoir Balance,
  which opens its new-case dialog prefilled (initial pressure, fluid
  system, case name; k and skin surfaced in the toast since material
  balance has no direct field for them); tested k to the Waterflood
  Design Studio displacement inputs. Both receivers gained intake
  effects.
- Playwright e2e `e2e/well-test-analysis-studio.spec.js` on the new
  `/dev/well-test-analysis-studio` harness route (dev-only, absent from
  prod builds): five-tab walk with the Horner window recovering the
  sample's generating truth (k within 6% of 85 md, skin within 1.0 of
  6.5), a real PDF download, and the gas-mode deliverability surface.
  3/3 green against the staging dev server 2026-07-18. The handoff
  navigations land on auth-gated dashboard routes, so e2e asserts the
  senders' enablement; the shared wellTestData contract ships in one PR.

## Program wrap-up

All five phases are done. Remaining operational step (outside the PR
stack): merge #101 through #105 in order, upload the production build,
then apply the deploy-gated tile activation migration `20260718200000`
(honest-catalog rule). Named future scope stays as recorded: horizontal
wells, limited entry, variable wellbore storage, multiphase Perrine, RTA,
SI units, closed-rectangle boundary, pseudo-time as a diagnostics
abscissa.

## Locked owner decisions (2026-07-18)

- Tile moves to Reservoir module, slug `well-test-analyzer` kept.
- Tile activation ships after WT3 with the carrying prod upload.
- Horizontal wells, limited entry, variable wellbore storage, multiphase
  Perrine, RTA, SI units: future scope outside this program.
