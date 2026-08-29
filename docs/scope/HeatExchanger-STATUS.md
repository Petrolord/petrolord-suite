# Heat Exchanger & Cooling Studio — status

Phase: Facilities F4 (Facilities-ROADMAP.md §3 app 4, §5 F4)
Status: **SHIPPED 2026-08-29** (branch feat/facilities-f4)
Slug: `heat-exchanger-sizer` (kept — it carries entitlements; the tile
RENAMES via the HELD migration 20260829590000).

## What shipped

- **Engine** (`@petrolord/engines` PR #80, vendored, shim at
  `src/utils/facilities/engine/heatTransfer.js`):
  - energy balance that REFUSES a crossed exchanger instead of passing
    a negative driving force downstream
  - LMTD, and the correction factor F **computed** from Bowman's
    published closed form with multi-shell conversion. The
    predecessor made the user TYPE an Ft, which is exactly where a
    design goes quietly wrong; F below 0.8 now warns to add a shell
    pass, and a duty beyond the stated shells is refused rather than
    given a number the configuration cannot deliver.
  - effectiveness-NTU both directions for counter / parallel / 1-2
    shell, each arrangement's hard effectiveness ceiling named
  - overall U assembled from its named resistances with the
    controlling one identified and the fouling penalty quantified
  - tube-side film by Dittus-Boelter with Sieder-Tate; the transition
    Reynolds band (2300 to 10000) is REFUSED rather than interpolated
  - TEMA-style tube count and bundle/shell diameter
  - air cooler with the **hot-day ambient derate**
- **THE ORACLE CAUGHT A REAL BUG.** The R = 1 limit of the Bowman form
  carries `-1-R = -2` inside the logarithm; writing `-1` there is a
  silent ~20 percent error in F at P = 0.5. The independent route
  (F = NTU_counter / NTU_1-2 from the eps-NTU closed forms)
  disagreed and the transcription was fixed before it shipped.
- Independent validation routes: F by the eps-NTU identity, eps-NTU by
  an RK4 march of the exchanger ODEs (agreeing with the closed form to
  six decimals), LMTD by numerical integration of the driving force,
  SI re-derivations for U, the film and the air cooler. 19 gates;
  engines suite 1884 green.
- **Studio** on the kit (`src/components/heatexchanger/` +
  `src/contexts/HeatExchangerContext.jsx`), replacing the 573-LOC
  inline sheet. Tabs: Sizing (balance → LMTD → F → U → area → bundle,
  each step visible), Rating (what an exchanger you already own
  delivers), Air Cooler (design and hot-day capacity side by side).
  Help guide; smoke test.
- **Persistence**: kept table `saved_heat_exchanger_projects`, brought
  onto the shared savedProjects service by migration 20260829580000
  (updated_at added, APPLIED live). Inputs-only convention.

## Honest limits (stated in-app)

- Shell-side film coefficient is an input: a rigorous shell-side value
  needs stream analysis (Bell-Delaware and beyond), which is HTRI's
  job, not this studio's.
- The transition Reynolds band is refused, not interpolated.
- Air-cooler U is on a bare-tube basis.

## Open

- Tile rename migration 20260829590000 HELD for the prod upload.
- ARMED literature gates: TEMA F charts (the closed form is
  implemented; the published chart cross-read awaits owner PDFs),
  fouling-factor tables.
