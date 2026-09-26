# Petroleum Economics Studio (EPE): status

Scope document: `docs/scope/EPE.md`. Programme table: `docs/scope/Economics-ROADMAP.md`.

## EC7: PIA 2021 / NTA 2025 compliance (2026-09-26)

**State: BUILT, PR open** (branch `fix/epe-pia-2021-compliance`). Engine: engines
PR #262 merged as 3778451 (engines 3.12.0), vendored with the Suite pin at 3778451.
Migration `20260926150000_epe_pia_2021_inputs.sql`: **HELD, NOT APPLIED**.

Owner decision D1: the PIA regime follows the gazetted PIA 2021, NTA 2025
(June 2025 gazette), Petroleum Royalty Regulations 2022 and Finance Act 2023
by default; `pia_legacy_pre_audit: true` reproduces the pre-audit engine
(3.11.0) exactly. Sources, decisions D1 to D8 and the repairs:
`packages/engines/tools/validation/economics/AUDIT-PIA-2021.md` and
`FINDINGS-pia2021.md`.

### What changed in the Suite

| Area | Change |
|---|---|
| Vendoring | Engines #259, #260 and #261 first (pin 9187701), then #262 (pin 3778451). Guard: 1029 paths byte for byte, 0 deviations |
| Regression contract | Default path: worked example inputs NPV 141,236,909.83 and 27 line items (text oracle). Legacy switch: NPV 135,185,570.34 and every line item. EPE.md sections 3.1, 3h, 5, 6 and 7 |
| Tests | `epe-engine.test.ts`, `epe-mc.test.ts`, `epe-validation.ts` (101 checks, Cases 1a, 1b, 8), fixture with the flag and the default-path expectations, `economicsDefects.test.js`, new `piaCompliance.test.jsx` and `piaTemplateTypes.test.jsx` |
| Migration (held) | Nine compliance inputs; TET default dropped (NULL = statute); deep offshore reading default and NOT NULL dropped; every saved PIA config stamped legacy |
| Run Console | Compliance inputs with citations; required stated choices; legacy toggle; refusal panel with one-click fixes and run as legacy |
| Results Viewer | `pia_only_then_nta_2025` badge with `nta_first_year`; legacy notice; engine notes; royalty split and rates in the table and exports; refused-run page with fixes |
| Case Detail | Refused runs link "Fix the inputs" and "Run as legacy" |
| Fiscal Regime Designer | Editor and template list for `pia_2021`, `pia_cumulative_production`, `costRecoveryBase` |
| Sensitivity batch | A null config field is unset (no phantom 0% TET sweep) |
| Ekene demo kit | Economics domain regenerated: field NPV10 1.98 MM, increment 2.44 MM, EVPI 0.075 MM |
| Help | EPE guide: royalty tranches, gas royalty, royalty by price, NDDC, CPR scope, TET 3% from 1 May 2023, framework per year from 2026, required choices, legacy runs. Fiscal Designer guide: the template types |

### Owner steps, in order

1. Apply `supabase/migrations/20260926150000_epe_pia_2021_inputs.sql` to staging, then production.
2. Redeploy the edge functions that bundle the engine through `supabase/functions/_shared/epe-engine.ts`:
   `supabase functions deploy epe-cash-flow-engine`, `supabase functions deploy epe-cash-flow-engine-batch`,
   `supabase functions deploy epe-monte-carlo`.
3. Upload the Suite build.

Until step 1 the new Run Console cannot save a run config (unknown columns),
so merge and upload only after the migration. Until step 2 a new run still
computes on the pre-audit engine.

### Open items

- The re-gazetted NTA Certified True Copy was not read (engine D3); figures follow the June 2025 gazette.
- The Finance Act 2021 TET rate (2.5% before 2023) and the NDDC Act base rest on secondary sources.
- Not computed (course concept only): associated vs non-associated gas split, fiscal-price top-up (s.268 / NTA s.73), exploration and appraisal expensing, acquisition allowance, PSC terms inside the cash flow engine, NTA s.85 gas credit, statutory company-level minimum ETR test.
- The Fiscal Regime Designer page seeds a default regime named "Nigerian PIA (PSC)" with invented terms (12.5 / 15% royalty, RRT 20); it is not the re-based template. Rename or re-seed it in a follow-up.
- The owner's Ekene kit zip needs a rebuild after merge (economics numbers moved).
- NextGen: the `cashflow` and `fiscal` course re-cuts listed in FINDINGS-pia2021.md section 7 (separate NextGen PR, decision D2).
