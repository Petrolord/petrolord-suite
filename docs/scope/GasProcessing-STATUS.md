# Gas Processing Studio — status

Phase: Facilities F3 (Facilities-ROADMAP.md §3 app 3, §5 F3)
Status: **SHIPPED 2026-08-29** (branch feat/facilities-f3)
Slug: `gas-treating-dehydration` (kept — it carries entitlements; the
tile RENAMES via the HELD migration 20260829570000).
Scope: one app, three units (owner decision F#1).

## What shipped

- **Engine** (`@petrolord/engines` PR #79, vendored, shim at
  `src/utils/facilities/engine/gasProcessing.js`). Its governing rule
  is the inverse of the predecessor app's: the old code hid design
  choices inside constants (`TEG_GAL_PER_LB_H2O = 4`,
  `REBOILER_DUTY_BTU_PER_GAL = 750`, `BTEX_ABSORPTION_PERCENT = 0.15`);
  here every such number is an input with its customary range named,
  and everything computable is computed:
  - saturated water content by ideal VLE over liquid water (Magnus
    saturation pressure), with an explicit warning that the
    McKetta-Wehe real-gas correction grows past 1000 psia (chart gate
    ARMED)
  - the Kremser absorption-factor relation, both directions, gated
    against a brute-force stage-cascade linear solve
  - TEG package with the reboiler duty assembled from named parts
    (sensible + water vaporization + stated reflux) instead of one
    hidden Btu/gal
  - amine package from the acid-gas mole balance, with the customary
    strengths, rich-loading limits and duty factors for MEA/DEA/MDEA
    offered as defaults and a corrosion warning past the customary
    rich loading
  - Souders-Brown contactor diameter on the validated DAK z-factor
  - Joule-Thomson screening whose coefficient is DERIVED from the DAK
    correlation's temperature derivative. It reproduces the classic
    7 F per 100 psi field rule rather than assuming it, and is
    correctly finite at low pressure (a virial effect, not an
    ideal-gas one — an earlier test assumption that it should vanish
    was wrong and the engine caught it).
  Oracle: Antoine vapor pressure against the module's Magnus (two
  published fits meeting), stage-cascade linear solve against the
  Kremser closed form, balances re-derived in SI. 12 gates; engines
  suite 1864 green.
- **Studio** on the kit (`src/components/gasprocessing/` +
  `src/contexts/GasProcessingContext.jsx`), tabs: Dehydration (water
  balance, duty split shown, Kremser stages needed vs stages given,
  contactor diameter, BTEX tons/yr), Sweetening (mole balance,
  circulation, rich loading, contactor, with the honest statement that
  selectivity needs rate-based simulation), Dew Point (JT coefficient,
  cooling, downstream water-holding capacity, pointing hydrate margin
  at Production's Flow Assurance Studio). Help guide; smoke test.
- **Persistence**: `saved_gasprocessing_projects` (migration
  20260829560000, APPLIED live, MIGRATIONS.md logged). Inputs only.

## Honest limits (stated in-app)

- Ideal-VLE water content: chart reading needed for design above
  ~1000 psia.
- Amine sizing is a mole-balance screening bound; selectivity and
  approach to equilibrium need rate-based simulation.
- Hydrate margin belongs to Production's Flow Assurance Studio.

## Open

- Tile rename migration 20260829570000 HELD for the prod upload.
- ARMED literature gates: McKetta-Wehe water-content chart, TEG
  equilibrium/absorption-factor charts, GPSA amine worked examples
  (owner PDFs).
