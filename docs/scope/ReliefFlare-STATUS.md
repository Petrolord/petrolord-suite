# Relief & Flare Studio — status

Phase: Facilities F2 (Facilities-ROADMAP.md §3 app 5, §5 F2)
Status: **SHIPPED 2026-08-29** (branch feat/facilities-f2)
Slug: `relief-blowdown-sizer` (kept — it carries entitlements; the
tile RENAMES via the HELD migration 20260829550000).

## What shipped

- **Engine** (`@petrolord/engines` PR #78, vendored, shim at
  `src/utils/facilities/engine/relief.js`): API 520 gas/vapor with
  both branches (critical C-form and subcritical F2, the switch
  decided by the critical ratio, the branches proven to meet at it);
  liquid with the published Kv equation iterated through Reynolds;
  steam with the Napier closed form and its range refusal; the API 521
  fire case (exact wetted-segment geometry, 21000/34500 heat input,
  relief load with the near-critical latent-heat warning) sized at the
  ACTUAL fire-case relieving pressure — the old engine hardcoded
  100 psig there; KO-drum droplet settling (C-Re iteration);
  point-source radiation forward AND inverted (the distance an
  allowable demands, which is what a stack height buys); adiabatic
  blowdown march. Oracle: first-principles isentropic-nozzle flux in
  absolute SI, so the 520/735 constants are CHECKED, not repeated.
  15 gates; engines suite 1851 green.
- **Chart factors typed by design**: balanced-bellows Kb/Kw, superheat
  KSH, insulation environment factor are published as charts/tables;
  they are inputs with references named and warnings where the default
  stops being safe. Literature gates stay ARMED.
- **Studio** on the kit (`src/components/reliefstudio/` +
  `src/contexts/ReliefStudioContext.jsx`), tabs: PSV Sizing
  (gas/liquid/steam/fire with the orifice ladder and honesty notes),
  KO Drum, Radiation, Blowdown (ChartFrame curve with the 15-minute
  marker). Help guide; smoke test.
- **Persistence**: kept table `saved_relief_projects`, brought onto
  the shared savedProjects service by migration 20260829540000
  (updated_at added, APPLIED live). Old ad-hoc save/results_data path
  retired; inputs-only convention.
- **Deleted**: `src/utils/reliefCalculations.js` (superseded: its
  Kb/Kc were hardcoded 1.0, its fire case sized at a hardcoded
  pressure, its radiation had no inverse).

## Open

- Tile rename migration 20260829550000 HELD for the prod upload.
- Armed literature gates: API 520 Kb/Kw charts, KSH table, API 521
  insulation credits and a published fire-case worked example (owner
  PDFs).

## FC5-0 repair wave, 2026-09-16

The repair pass before the NextGen Relief & Flare Systems course. The engine
half is engines PR #200 (`tools/validation/facilities/FINDINGS-relief.md`,
43 findings from the recon, 26 of them reachable by typing into a box in this
studio). This section is the Suite half: what moved on a screen, and what this
layer was doing on the user's behalf.

### Engines 3bac13c vendored (FC5-0)

The pin in `packages/engines/VENDOR.json` moved from `82ec6d4` to `3bac13c`,
engines PR #200. Six canonical paths, and the import closure GREW BY ONE:
`__tests__/facilities.relief.test.js` now imports `RADIATION_LEVELS` from
`engines/facilities/spacing.js`, which was already vendored and is unchanged,
to assert that one published table carries one set of words across two
engines. `npm run check:engines` is clean with an EMPTY ledger, **744 paths
compared byte for byte**, and the manifest was re-derived against a real
canonical clone.

### What moves on a live screen

| tab | before | after | why |
| --- | --- | --- | --- |
| Blowdown, shipped defaults | 275.0 s | 268.1 s | a hidden 0.975 multiplied the typed discharge coefficient, so 0.85 ran as 0.829 |
| Blowdown, 500 ft3 with a 38 in orifice | **"0.0 min", in emerald, "inside the customary 15 minutes"** | 0.19 s | the march broke when a step would have emptied the vessel and returned `timeS: 0` with no `error` key |
| KO Drum, required length | 10.56 ft | 9.82 ft | the vapour space is the circular segment above the level, and the standard base is one base |
| KO Drum, holdup 0 to 0.9 | flat 10.56 ft at every value | 10.5 to 20.2 ft | the `(1 - f)` in the vapour area and the `(1 - f)` in the fall distance used to cancel exactly |
| KO Drum, dropout velocity | 2.997 ft/s | 3.015 ft/s | the terminal-velocity balance rather than its three-figure packaging |
| PSV Liquid at about 1 cP | Kv 1.00379, area 1.27544 in2 | Kv 1.0, area 1.28027 in2 | the viscosity correction asymptotes above 1 and was applied unclamped, so it UNDERSIZED the valve |
| PSV Fire with a typed Kd of 0.9 | 1.235639 in2, orifice J (the box did nothing) | 1.338609 in2, orifice K | the fire tab dropped the Kd, Kb and Kc the gas tab honours |
| PSV Gas and Steam, shipped defaults | unchanged, bit for bit | | |

### What this layer was doing on the user's behalf

- **`num` was `parseFloat`.** It reads `'50,000'` as 50, `'0.5.5'` as 0.5 and
  `'1/2'` as 1, so the engine never saw the string it would have refused. A
  thousands separator in the relief-load box sized **0.002454 in2 instead of
  2.453842 and printed orifice D where the answer is L**, a factor of 1000. It
  now parses the whole value or hands the engine a NaN, and the fallback
  applies to an EMPTY box only, so garbage no longer silently becomes a
  default. A saved study carries whatever string it was saved with, so this
  was reachable without a keyboard.
- **The fire tab hardcoded a 14.7 psia back pressure** and passed no
  coefficients at all. Both are boxes now, beside the ones the gas tab has.
- **The drum used a 14.65 psia and 520 R standard base** while the vapour
  density three lines above used the package's 14.696 and 519.67: two halves
  of one `useMemo` disagreed about standard conditions, by 0.3763 percent
  carried straight into the answer, with no compressibility applied to the
  conversion either. The rate now goes through the MASS rate and divides by
  the density actually used, so there is one base and a typed real density
  brings its own z with it.
- **Three of the four derived blocks had no `try/catch`**, so anything the
  engine threw white-screened the tab. All four have one.
- **The help guide asserted "121 percent of set"**, which is a typeable box,
  and described the drum by the vapour space the answer was ignoring. Both
  now say what the studio does, and the L/D note carries both of its halves.
- Four owner copy-rule breaches in live learner-facing copy are gone, and a
  test asserts the help content carries no em dash and no "X, not Y"
  contrastive.

### Gates

`src/contexts/__tests__/reliefStudioContext.test.jsx`, **38 numeric gates**,
where this layer had none: the arguments each tab hands the engine, the
parser's whole refusal table, the fire coefficients, one standard base, the
holdup sweep, the blowdown time, and a sweep asserting every derived block
either answers or refuses by name and never returns a non-finite number.

### Open

- Staging walk on the four tabs by the owner, and a prod upload: the Blowdown
  and KO Drum numbers move for every existing saved study.
