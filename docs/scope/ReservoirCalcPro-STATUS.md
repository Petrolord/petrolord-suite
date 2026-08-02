# ReservoirCalc Pro — STATUS

App: `src/pages/apps/ReservoirCalcPro/` (Geoscience module). Contact-based
volumetrics flagship; deterministic + Monte Carlo STOIIP/GIIP.

## 2026-08-02 — Per-parameter unit selection + convert-on-toggle

The Field/Metric select used to hard-bind every input's unit, and toggling it
reinterpreted stored numbers (5000 acres silently became 5000 km²). The Bg
field only accepted rcf/scf, a 5.615× trap for rb/scf–rb/Mscf PVT values.

### What changed
- **Canonical-value model**: `state.inputs` always stores engine units
  (field: acres/ft; metric: km²/m; system-independent: Bg rcf/scf ≡ rm³/sm³,
  pressure psi, temperature °F — what `FluidPropertyLibrary` consumes). New
  `services/unitsCatalog.js` converts at the UI boundary; engines untouched.
- **Per-field unit dropdowns** (`components/common/UnitInput.jsx`, used in
  `ExpertInputPanel`): Area (acres/km²/ha/m²/ft²/mi²), Thickness (ft/m),
  Bg (rcf/scf, rb/scf, rb/Mscf), Pressure (psi/bar/kPa/MPa), Temp (°F/°C/K).
  Display units live in `state.inputUnits`, persisted with the project.
- **Convert-on-toggle**: `SET_UNIT_SYSTEM` now converts area/thickness/OWC/GOC
  in place (round-trip exact); `ProbabilisticPanel` rescales its distribution
  params by the same factors. Bo/Bg/fractions are ratios — unchanged.
- **Result unit selectors** (`DeterministicResultsDisplay`): STOOIP in
  STB/MMSTB/sm³/MMsm³, GIIP in scf/MMscf/Bscf/sm³/MMsm³/Bsm³ — display-only
  conversion from the result's own canonical; defaults reproduce the old view.
- **Guards**: Bg > 0.1 rcf/scf now warns (typical rb/Mscf-entered-raw
  signature); dynamic Bo/Bg labels in metric (`rm³/sm³`); `UnitConversionEngine`
  gained ha/mi²/gasFVF factors and lost its stray React import (it was
  previously dead code — now wired in).
- Tests: `services/__tests__/unitsCatalog.test.js` (16) incl. cross-system
  STOOIP equivalence through the toggle conversion.

## 2026-07-31 — Volumetrics standards audit + chart-template compliance

Full audit of the oil and gas in-place computations against industry-standard
volumetric practice (SPE/PRMS-style deterministic + probabilistic estimation).

### Verified correct (no change)
- **Field-unit constants**: STOIIP [STB] = 7758 · A[ac] · h[ft] · NTG · φ ·
  (1−Sw) / Bo; GIIP [scf] = 43,560 · A · h · NTG · φ · (1−Sw) / Bg (Bg in
  rcf/scf). Metric: GRV[m³] · NTG · φ · (1−Sw) / FVF → sm³ (area km² × 1e6).
- **Contact-based engine** (`ContactVolumetricsEngine`): grid-integrated GRV
  against OWC/GOC per cell, gas-cap/oil-leg split with no shared pore volume,
  planimetric area + XY/depth unit + z-convention handling, AOI fractional
  clipping, hull masking. Hypsometric O(1) contact lookup for MC.
- **Fluid correlations** (`FluidPropertyLibrary`): Standing Bo (F = Rs·√(γg/γo)
  + 1.25T, Bo = 0.9759 + 0.00012·F^1.2) and real-gas Bg = (Psc/Tsc)·zT/P.
- **Monte Carlo** (`src/lib/monteCarlo.js` canon): Gaussian-copula correlated
  sampling, petroleum percentile convention (P90 = low), truncation with
  rejection accounting, φ/Sw clamped to [0,1], Spearman/Pearson sensitivity.
- **Unit tables** (`UnitConversionEngine`): all factors check out (7758,
  43,560, 4,046.86, 0.158987, 5.61458, pressure set).

### Fixed in this pass
1. **Analytic oil+gas double-count (standards violation).** The simple
   (area × thickness) method and the analytic Monte Carlo mode computed BOTH
   STOIIP and GIIP from the full HCPV, double-counting pore volume for
   `oil_gas`. Now the GRV is split by an explicit **Gas Cap Fraction of GRV**
   input (the analytic stand-in for a GOC, shown for oil+gas + simple method).
   With no fraction set the case degrades to undersaturated oil (GIIP = 0)
   with an explicit warning, matching the contact engine's no-GOC behaviour.
   Engine outputs now expose `grvOil/grvGas` and `hcPoreVolumeOil/Gas` as the
   true split (structural path already did).
2. **Summary-table pore-volume display bug**: per-zone Pore Vol cells
   multiplied by 7758 (field) / 1e6 (metric), i.e. barrels shown under an
   Ac-ft header and nonsense in metric. Now plain GRV·NTG·φ in reservoir
   volume units, consistent with the Total row.
3. **validateInputs**: duplicate Sw penalty collapsed; gas-cap fraction range
   check added.

### Chart-template compliance (Petrolord standard)
- Main results charts (`ProbabilisticResultsDisplay`: histogram, expectation
  curve, tornado) already use `ChartFrame` (white surface + ChartLogo
  watermark) + `chartTheme` — verified compliant, untouched.
- Presentation slides (`DeterministicSlide`/`ProbabilisticSlide`) are white,
  theme-colored, branded via SlideShell — compliant.
- **Deleted** dead `ProbabilisticResultsPanel.jsx` (unreferenced, rendered
  literal "Chart removed" placeholders).
- **Rebuilt** the `DistributionEditor` PDF preview (was a "Chart removed"
  stub) as a template-compliant mini AreaChart in `ChartFrame`; added the
  missing lognormal PDF to `DistributionManager.getPreviewData` (was flat).

### Tests
`npx jest src/pages/apps/ReservoirCalcPro` — 87 tests green (4 new: analytic
split field + metric + degrade-with-warning, MC analytic split + warning).

### Known remaining (not scheduled)
- Analytic MC treats the gas-cap fraction as a constant (not a sampled
  distribution); structural mode already samples contacts instead.
- Condensate yield in gas presets is unused (no condensate stream).
- PPFG/Velocity adapters still dead pending `shared_data_registry`.
