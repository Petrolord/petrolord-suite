# Reservoir Balance (MBAL) — Status

> Companion to `docs/scope/ReservoirBalance.md` (full scope, decision log,
> process patterns). This file is the fast-read snapshot.
> Last updated: 2026-06-04 · State as of the 2026-05-17 patch series.

## What MBAL does

Material-balance reservoir analysis (Havlena-Odeh formulation) for oil and
gas reservoirs: OOIP/OGIP estimation by regression, drive-index
decomposition, aquifer influx modeling (pot, Fetkovich, Carter-Tracy), and
diagnostic plots. The engine is pure TypeScript in
`supabase/functions/_shared/mbal-engine.ts` (~111 KB), invoked by the
`calculate-mbal` Edge Function and surfaced in the UI under
`src/components/reservoirbalance/` (case detail tabs: Data Hub, PVT/Rock,
Aquifer, Run, Plots). Every result carries a `validation_tier` +
`validation_reference` so the UI can state honestly how trusted each code
path is.

## Validation tier matrix (read from `resolveValidationTier`, engine ~line 1417)

| Fluid | Aquifer | Gas cap | Tier | Reference / tolerance |
|---|---|---|---|---|
| gas | none | — | `published_method` | Standard p/z (Havlena-Odeh 1963) |
| gas | pot | — | `benchmark_verified` | Pletcher SPE 75354 Tables 1-3 — 0.19% OGIP |
| gas | fetkovich | — | `benchmark_verified` | Pletcher SPE 75354 Table 9 / Fig. 8 — 0.76% OGIP |
| gas | carter_tracy | — | `benchmark_verified` | Dake (1978) Ex. 9.2 — 3.53% (CT math shared with oil path; oil validation qualifies gas) |
| oil | none | m = 0 | `benchmark_verified` | Tarek Ahmed Ex. 11-3 (Virginia Hills) — engine LSQ 291.3 vs graphical 257 vs volumetric 270.6 MM STB |
| oil | none | m > 0 | `benchmark_verified` | Dake Ex. 3.4 — engine 115.5 vs Dake 114 MM STB (<2%) |
| oil | pot | m = 0 | `benchmark_verified` | Pletcher SPE 75354 Tables 10-13 — 0.13% OOIP |
| oil | pot | m > 0 | `published_method` | Generalized pot + gas-cap (Havlena-Odeh); no worked example yet |
| oil | fetkovich | — | `published_method` | Fetkovich SPE 2603 (1971); **no oil-side worked-example validation** — only remaining unvalidated aquifer path |
| oil | carter_tracy | — | `benchmark_verified` | Dake Ex. 9.2 — OOIP 301.0 vs 312 MMSTB (3.53%), R² 0.9998 |

## Validation harness (`tools/validation/mbal-validation.ts`)

Run: `npx tsx tools/validation/mbal-validation.ts`

| Case | Setup / reference | Asserts |
|---|---|---|
| 1 | Gas + pot aquifer (Pletcher) | OGIP ±2%; aquifer W ±10% (74.5 MM rb); We@yr10 ±10%; drive-index sum 1.00±0.05 |
| 2 | Oil + pot aquifer (Pletcher Tables 10-13) | O-1..O-4: OOIP ±5% of 20.3 MM STB; W ±10% of 79 MM rb; DI sum; individual DIs ±0.03 |
| 2C | Oil + Carter-Tracy (Dake Ex. 9.2, wedge, 140°, reD=5) | C-1..C-7: OOIP ±10% of 312 MMSTB; DI sum; WDI substantial; DDI meaningful-not-dominant; GDI=0; mechanism = water-drive; R² ≥ 0.85 |
| 2D | Oil + no aquifer, depletion drive (Tarek Ahmed Ex. 11-3) | D-1..D-6: OOIP ±15% of 257 MMSTB; DI sum; DDI+SDI invariant (D-3 revised 2026-05-17 — SDI is large for this undersaturated case); WDI≈0; GDI=0; mechanism = depletion_drive |
| 2G | Oil + gas cap, no aquifer (Dake Ex. 3.4) | G-1..G-7: OOIP ±5% of 114 MMSTB; DI sum; GDI substantial; DDI substantial; no water drive; mechanism; R² ≥ 0.95 |
| 3 | Gas + Fetkovich (Pletcher Table 9) | F-1..F-5: OGIP ±5% of 100.8 Bcf; R² > 0.99; DI sum; WDI > 0.20; tier = benchmark_verified |
| 4-7 | PVT substitution / lab-table paths (Pletcher data) | Vasquez-Beggs, Glaso, Dranchuk-Abou-Kassem, lab-table interpolation |

(Case numbering is historical: 2C/2D/2G were slotted in to keep the
pre-existing Case 3+ labels stable.)

## Recently validated (Phase 5, 2026-05-17 patch series)

- **Carter-Tracy corrections** (`2026-05-17_mbal_engine_carter_tracy_corrections.cjs`)
  — four fixes in one release:
  1. `r_R` configurable via `aquifer_params.aquifer_radius_ft` (was hardcoded 2980 ft)
  2. `μ_w` configurable via `aquifer_params.aquifer_water_viscosity_cp` (was hardcoded 0.5 cP)
  3. **Δp convention bug fix** — was van Everdingen averaged step
     `(p[j-1]−p[j+1])/2` (correct for the HvE *convolution* form, wrong for
     CT's *recursive* form); now cumulative drop `p_i − p_j` per Carter-Tracy
     (1960), Klins (1988), Lee-Wattenbarger (1996). The bug caused ~80% We
     under-prediction; all prior CT results were affected.
  4. Finite-aquifer pD: tanh-blended transition to pseudo-steady-state at
     tD_pss = 0.4·reD² when `radius_ratio` is set.
- **CT benchmark + tier flip** — Case 2C passes C-1..C-7; oil+CT and gas+CT
  promoted to `benchmark_verified` (Dake Ex. 9.2, 3.53% OOIP, R² 0.9998).
- **Oil + no aquifer** — Case 2D (Tarek Ahmed Ex. 11-3) → promoted; stale
  "not yet validated" warning narrowed to the m>0-without-validation case.
- **Oil + gas cap, no aquifer** — Case 2G (Dake Ex. 3.4) → promoted; m=0.5
  reproduces Dake's preferred solution.
- **Layer B fix** — `aquifer_cumulative_we_rb` now populated for CT and
  Fetkovich oil paths (was gated on pot-aquifer-only `W_rb`).
- Harness plumbing fixes en route: dates, aquifer params, field names
  (v1-v3), We field (see the `2026-05-17_mbal_validation_dake_ct_*` chain).

## Known paused work — Fetkovich Δp̄ convention

`computeFetkovichWe` (engine ~line 1156) drives influx with
`p̄_aq[n-1] − p_wf[n]` where `p_wf[n] = (p[n-1] + p[n])/2` — a **midpoint
convention** the doc comment attributes to Pletcher's recommendation for
material-balance use. The May 17 CT investigation proved the engine's *other*
aquifer model had silently used the wrong Δp convention for its formulation;
the analogous question for Fetkovich — whether the midpoint p̄_R convention
matches Fetkovich (1971)'s intent, and how much it moves We vs. an
end-of-step or initial-pressure convention — has not been explicitly
investigated in the repo, and would be worth resolving when an oil+Fetkovich
worked example is sourced. It is coupled to the one remaining
`published_method` aquifer path: **oil + Fetkovich has no worked-example
validation**, so there is currently no benchmark that would catch a wrong
convention there. Gas + Fetkovich *is* benchmarked (Pletcher, 0.76%), which
bounds the question for that path.

## Next priorities

1. **Oil + Fetkovich worked example** — the last `published_method` aquifer
   path; a benchmark would also settle the Δp̄ convention question above.
2. **Oil + pot + gas cap (m>0) worked example** — last `published_method`
   path overall (candidates: Tarek Ahmed, Craft-Hawkins-Terry).
3. **Phase 5 polish remaining** — derive `r_R = √(A/π)` from reservoir
   geometry and `μ_w` from temperature/salinity (McCain) as *defaults*
   (both are now at least user-overridable); surface in PvtRock UI.
4. **Phase 4C** — PVT correlation library (largest remaining Phase 4 scope).
5. **Phase 6** — pressure history match (inverse MBE via Newton iteration),
   DCA reconciliation.
6. Carry-overs: tier-mapping consolidation via `/tier-info` (Phase 7),
   dashboard tile rename, plot export-as-image, Ramagost-Farshad p/z overlay.

## Where things live

| What | Path |
|---|---|
| Engine math | `supabase/functions/_shared/mbal-engine.ts` |
| Edge function | `supabase/functions/calculate-mbal/index.ts` |
| Validation harness | `tools/validation/mbal-validation.ts` |
| UI | `src/components/reservoirbalance/` |
| Scope + decision log | `docs/scope/ReservoirBalance.md` |
| Patch history | `tools/patches/*.cjs` (headers are the change log) |

Deploy reminder: repo edits to the engine are **not** deployment — redeploy
with `supabase functions deploy calculate-mbal` after patching.
