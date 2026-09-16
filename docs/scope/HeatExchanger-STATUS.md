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

## FC6-0 repair wave (2026-09-16)

The repair pass before the NextGen Heat Exchange & Cooling course.
Recon: 44 findings, 21 reachable by typing into a box in this studio,
**three wrong at the studio's own shipped defaults with nothing typed**.
Engines PR #202, Suite PR alongside it. Full account in the engines
repo at `tools/validation/facilities/FINDINGS-heattransfer.md`.

### Numbers on screen that changed

| on screen | before | now |
| --- | --- | --- |
| Tubes | 92 | **74** |
| Area required | 286 ft2 | **230 ft2** |
| U dirty | 73.9 | **92.1** |
| Tube-side Reynolds | 16,299 | **44,052** |
| hi | 247 | **548** |
| Bundle / shell diameter | 10.9 / 13.4 in | **9.9 / 12.4 in** |
| Hot-day capacity retained | 81 % | **90 %** |
| Hot-day duty | 16.23 MMBtu/hr | **18.06 MMBtu/hr** |
| Fan power / motor power | 96.5 bhp / 104.9 hp | **94.0 bhp / 102.2 hp** |

Two causes. The whole Sizing column moved because the context
hard-coded `nTubes: 200` into the tube-side film while the card beside
it printed 92, so U was computed at a tube count the same screen
contradicted; the film, the coefficient, the area and the bundle are
iterated to one count now and the studio prints the trail. The Air
Cooler column moved because the hot day is RATED at fixed UA and fixed
air mass instead of being scaled by a log-mean ratio, and because the
air density now belongs to a named draft type rather than to the mean
of the inlet and the outlet.

### Also in the studio

- The hot-day card reports the NEW process outlet and the NEW air rise
  beside the duty, and labels a check ambient below the design one as a
  capability rather than printing 167 percent "retained" in emerald.
- All five resistances are printed with their shares, and the
  controlling verdict carries the margin that decided it. At the old
  defaults that margin was 2.2 percent.
- The dead `ntuTarget` block is gone. It inverted the effectiveness the
  rating had just produced and was rendered nowhere.
- The shell count, the air outlet, the area per tube and the surface
  over the requirement are printed; the engine returned them and the
  panels dropped them.
- A draft type selector and a barometric pressure box, because fan
  power depends on both.
- The tube side is labelled as the cold stream, which it always was.
- `num()` refuses a stored value that is not a number. A saved study
  holding `'50,000'` used to parse to 50 and blame the physics.
- Every derived block is wrapped; a throw used to white-screen the tab.
- Four help-guide claims corrected, three "X, not Y" contrastives
  rewritten, and a new help section stating the six items held for
  literature.
- `src/contexts/__tests__/heatExchangerContext.test.jsx`: 20 numeric
  gates on the composition layer, where there were none.

### Still open after FC6-0

- The six items HELD FOR LITERATURE, recorded in the engine's exported
  `HELD_FOR_LITERATURE` table and stated in the studio's help: the
  `BUNDLE_K` provenance (its 45 and 90 degree rows are identical, so
  the Layout box does nothing between them), the Dittus-Boelter
  validity band and its cooling exponent, the Sieder-Tate exponent, the
  cross-flow F for an air cooler, the provenance of `kWall = 26` and
  the three fan and motor defaults, and the water density behind the
  fan constant 6356 (measured at 62.3033 lb/ft3, not cited).
- A hot stream on the tube side needs the held cooling exponent, so the
  studio offers a typed hi instead.
- Tile rename migration 20260829590000, still HELD for the prod upload.
