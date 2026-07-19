# Fluid Studio — validation tier matrix

Finalized in FS8. This is the reference map from every quantity the app
displays to its validation tier and the gate that backs the claim. The
badges rendered by `src/components/fluidstudio/FluidStudioTierBadge.jsx`
must agree with this table; update both together.

Tiers:

- **oracle_gated** — computed by the PR78 engine and cross-checked
  against the independent Python oracle (different solver routes) and/or
  NIST reference data in `tools/validation/fluidstudio/`. Agreement at
  solver precision (harness CASES cited per row).
- **published_method** — a recognized published method,
  transcription-checked against the source (and against the oracle's
  second transcription), but with no independent measurement gate at
  that point.
- **screening** — untuned engineering correlation; expect meaningful
  scatter against lab data.

## Compositional path (EOS mode)

| Quantity (where shown) | Tier | Backing gate |
|---|---|---|
| Flash phase split, beta, x/y, K values (CompositionalResultsCard) | oracle_gated | CASES 8–12, 14; jest flash.test.js |
| Phase densities, Z factors, molar volumes (all cards) | oracle_gated | CASES 2–4 (Peneloux volumes), 13–14 |
| C7+ characterization (Tc, Pc, omega, shift, BIP line) | published_method | CASE 13 double-transcription + n-alkane recovery; Kesler-Lee / Søreide / Jhaveri-Youngren / Chueh-Prausnitz sources |
| Interfacial tension (Weinaug-Katz) | published_method | CASE 16 transcription gate; parachors from the library, C7+ via Firoozabadi |
| LBC viscosities (every mu shown in EOS mode) | screening | CASE 16 transcription + NIST dilute anchors only; untuned Vc — order 10% gas, up to 2x oil |
| PT envelope points, saturation pressure (PhaseEnvelopeCard) | oracle_gated | CASE 15 boundary-by-boundary vs oracle; near-critical fallback labels kindSource 'density-heuristic' when the flash probe cannot classify |
| Separator train: stage splits, gas gravities, GOR partition, stock-tank API, multistage Bo (CompositionalSeparatorCard) | oracle_gated | CASE 18 + identities (material balance, telescoping) |
| CCE relative volume / liquid dropout (engine, FS7) | oracle_gated | CASE 20 + identities |
| DL Bod / Rsd / gas Z / gas gravity / Bg (engine, FS7) | oracle_gated | CASE 21 + identities (mole balance, cooldown telescoping) |
| Composite black-oil table Rs / Bo (EosPvtTableCard) | published_method | Amyx/McCain separator adjustment on oracle-gated DL + separator inputs; exact at Pb (identity-gated), approximate toward atmospheric |
| Composite table Bg / gas Z | oracle_gated | DL vapor states, CASE 21 |
| Composite table viscosities | screening | LBC, as above |
| Literature checks (Whitson/Ahmed flashes, Coats & Smart, Good Oil separator tests) | unarmed | CASES 12 / 17 / 19 scaffolded; arm only from printed pages |

## Black-oil path (default mode)

The black-oil stream predates the tier badges; its provenance is the
Phase 1 audit (see FluidSystemsStudio-STATUS.md). Summary equivalents:

| Quantity | Effective tier | Notes |
|---|---|---|
| Standing / Vasquez-Beggs Rs, Bo, Pb; Beggs-Robinson mu | published_method | audited defaults, used inside their stated envelopes |
| Glaso Rs, Beal-Cook-Spillman mu | screening | selectable but flagged with warnings (audit findings) |
| Gas Z (Papay/Sutton), Lee-Gonzalez-Eakin gas mu/FVF, oil co | published_method | standard correlations |
| Black-oil separator GOR partition | screening | staged-liberation approximation, telescopes to Rsb by construction; the EOS separator card is the rigorous counterpart |
| Hydrate envelope (Motiee), ASI blend screen, wax-content WAT | screening | stated validity bands on the cards |
| Measured WAT passthrough | n/a | reported as entered |

## Regression pins

- Black-oil default output: `src/utils/__tests__/blackOilSnapshot.*` (1e-9).
- EOS engine vs oracle: 207 harness gates (`node tools/validation/fluidstudio/run-validation.mjs`), 288 jest EOS tests.
- Performance: harness CASE 22 wall-clock budgets on the interactive pipelines.
