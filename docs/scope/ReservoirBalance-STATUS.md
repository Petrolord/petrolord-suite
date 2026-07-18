# Reservoir Balance (MBAL) — Status

> Companion to `docs/scope/ReservoirBalance.md` (full scope, decision log,
> process patterns). This file is the fast-read snapshot.
> Last updated: 2026-07-18 · MB program started (MB1 done); prior state
> as of the 2026-05-17 patch series.

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

## Material Balance Studio program (MB1-MB7, started 2026-07-18)

This table is the program ledger (plan approved by the owner 2026-07-18
in-session; extends `ReservoirEngineering-Module.md` §4.1). Reservoir
Balance is the next studio-class massive upgrade (after Waterflood W1-W6
and Well Test WT1-WT10). Owner decisions locked 2026-07-18: tile renamed "Material
Balance Studio" (slug kept), Aquifer Influx Calculator absorbed, Phase 6
history match included, aquifer tab hard-gated on Dake 9.2 client
cross-validation.

| Phase | Scope | Status |
|---|---|---|
| MB1 | Server validation completion: oil+Fetkovich CASE 8, m>0 combined CASE 9, McCain defaults CASE 10 | **DONE 2026-07-18** |
| MB2 | Client finite-reD pD + Dake 9.2 hard gate | **DONE 2026-07-18** |
| MB3 | Studio shell adoption + tile rename migration | pending |
| MB4 | Aquifer screening tab + calculator absorption | pending |
| MB5 | Pressure history match (inverse MBE, server LM) | pending |
| MB6 | Forecast/Contacts/Report wiring + DCA reconciliation | pending |
| MB7 | PVT prefill via Fluid Studio correlations + polish + close-out | pending |

### MB1 deliverables (2026-07-18)

Harness grew from 7 cases to 10 (79 checks, exit 0). Armed literature
fixtures in `tools/validation/mbal-fixtures/` (typed verbatim from the
book PDFs, missing fixture = hard failure):

- **CASE 8, oil + Fetkovich (Ahmed REH 4th ed. Example 10-10, data
  credited to Dake 1978 - the Dake 9.2 wedge aquifer worked with
  Fetkovich):** printed constants (Wi 28.41 MMMbbl, Wei 211.9 MMbbl,
  J 116.5 bbl/day/psi with the ln(reD) - 3/4 no-flow form) reproduced to
  0.02%; printed step-by-step We table matched to 0.08% worst-step; full
  oil path on Dake 9.2 production recovers OOIP 298.5 vs 312 MMSTB (4.3%)
  with final We 88.7 MM rb vs Dake's 89.2. Tier oil+fetkovich promoted to
  `benchmark_verified`. **The paused Fetkovich Δp̄ question is settled:
  the book's printed solution uses the step midpoint (p(n-1)+p(n))/2 -
  the engine's existing convention is the published one; the client
  engine already matches.**
- **CASE 9, oil + gas cap + water influx (Ahmed REH 4th ed. Example
  11-1):** combined-MBE terms anchored at the printed truth (back-
  calculated We 413,081 vs 411,281 bbl = 0.44%; DDI/SDI/WDI/EDI match
  the printed 0.4385/0.3465/0.2112/0.0038 within 0.2-1.2% in the book's
  index convention). The oil pot regression was generalized for m>0
  (denominator Em = Eo + m·Eg, (1+m) in the W back-out; m=0 behavior
  bit-identical, Pletcher CASE 2 untouched) and is gated by an exact
  synthetic round trip (N and W recovered to machine precision). Tier
  oil+pot+gas-cap promoted to `benchmark_verified` with the scope
  caveat in the reference text. Unvalidated-path warning removed.
- **CASE 10, McCain default chain:** Carter-Tracy μ_w now defaults to
  McCain (1991) at pi/T/salinity (salinity from aquifer_params, else the
  PVT tab's water_salinity_ppm, else fresh; e.g. 0.326 cp at 200 F fresh
  vs the old flat 0.5 cp placeholder) and r_R derives from
  reservoir_area_acres via r_R = sqrt(A/(π·θ/360)) when no explicit
  radius is given (2374 acres ⇔ 9200 ft on the Dake geometry, We
  identical to 1e-9). Every default is named in run warnings; the
  AquiferModel help copy now states the real chain (and the stale
  "infinite-aquifer regardless" hint was corrected - finite-reD blending
  has been live since 2026-05-17).
- Engine hygiene: `computeFetkovichWe` / `computeCarterTracyWe` /
  `computeOilPerTimestep` exported for harness + MB2 golden use; per-row
  `bg_rb_scf` on production points is now honored (was silently ignored;
  Dake CASE 2C now consumes its own table Bg and stays in tolerance).

Deploy note: MB1 changes `_shared/mbal-engine.ts`; redeploy
`calculate-mbal` staging-first (repo merge is not deployment).
[Deployed to the linked project 2026-07-18 after the MB1 harness pass.]

### MB2 deliverables (2026-07-18) — §4.1 HARD GATE CLOSED

The client Carter-Tracy (`src/utils/aquiferInfluxCalculations.js`) now
supports finite aquifers and reproduces the Dake Exercise 9.2 benchmark:

- `pDFinite(tD, reD)` / `pDprimeFinite`: the EXACT bounded-circle
  van Everdingen-Hurst constant-rate solution, Stehfest-inverted from the
  Well Test engine's scaled-Bessel Laplace form (imports
  `radialSandfaceLaplace` + `stehfestInvert`; no new math). Verified
  against the full VvE PSS expansion (slope 2/(reD²-1), intercept incl.
  the 2(tD+1/4) term), the classic cylindrical-source pD(1) = 0.802, and
  the line-source limit at large reD/tD. `carterTracy` takes optional
  `params.reD`; absent keeps the infinite-acting E1 path bit-identical.
- **Hard gate committed** (`src/utils/__tests__/
  aquiferInfluxCalculations.dake.test.js`, 12 tests): GATE A final We
  86.13 MM rb vs Dake HvE 89.2 (3.4% CT-vs-HvE method gap, tolerance 5%
  + a 1% regression pin); GATE B stepwise vs the committed server golden
  (`src/utils/__tests__/goldens/dake92-we.json`, generator
  `tools/validation/gen-dake92-client-golden.ts`): worst step 2.72% of
  final We (client exact pD vs server tanh-blended pD), tolerance 3.5%.
  U = 6446 rb/psi matches Dake exactly. Infinite-acting CT on the same
  history gives 151 MM rb - the overshoot the gate exists to prevent.
- Dake 9.2 fixture extracted to the shared
  `tools/validation/fixtures/dake-9-2.ts` (CASE 2C values unchanged),
  consumed by both the server harness and the golden generator.

## Next priorities (pre-program list, superseded by the MB table above)

1. ~~Oil + Fetkovich worked example~~ **DONE (MB1 CASE 8).**
2. ~~Oil + pot + gas cap (m>0) worked example~~ **DONE (MB1 CASE 9).**
3. ~~Phase 5 polish: McCain r_R and μ_w defaults~~ **DONE (MB1 CASE 10).**
4. **Phase 4C** — PVT correlation library → now MB7 (prefill via the
   Fluid Systems Studio client correlations through the lab-table path).
5. **Phase 6** — pressure history match + DCA reconciliation → now
   MB5/MB6.
6. Carry-overs → tile rename (MB3), plot export-as-image and
   Ramagost-Farshad overlay and tier consolidation (MB7).

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
