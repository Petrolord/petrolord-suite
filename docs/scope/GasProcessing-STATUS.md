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

## FC4-0 Suite repairs (2026-09-16)

Found by the NextGen FC4 course build (`/root/fc-wip-gasprocessing/FINDINGS.md`,
49 findings) and repaired in `src/contexts/GasProcessingContext.jsx`,
`src/components/gasprocessing/fields.jsx` and the two panel files. **The
vendored engine is untouched**; the engine half of FC4-0 is a separate
repair on `fix/fc4-0-gasprocessing` in the engines repo.

### The multiplier, F-U3

Twenty-one of the forty-nine findings were LIVE rather than theoretical
because of one pair of lines in this studio. `NumberInput` was a bare
`type="number"` with no minimum, no maximum and no validation, and
`fmt()` rendered NaN and Infinity as `--`, which is exactly what it
rendered for a box nobody had typed in. **So a user who typed something
the engine could not handle saw what they saw before typing anything.**
Both halves are fixed.

- **Every typed box now carries the bounds of its quantity** (`FIELD_LIMITS`),
  puts `min` and `max` on the control, prints the refusal under the box,
  and refuses the whole tab before the engine is called. A stage count of
  zero, a circulation ratio of zero or below, a solution strength of zero,
  above 100 or below zero, a negative lean loading, a negative regenerator
  duty, a negative reflux ratio, a BTEX fraction outside zero to one, a
  negative outlet spec, a cleared temperature box and a temperature below
  absolute zero are each named, at the box the user typed in.
- **A reboiler below the absorber is refused.** The engine took it and
  reported a negative sensible heat, a negative duty per gallon and a
  negative reboiler duty with no warning at all.
- **A non-finite result is no longer a blank.** `fmt` renders an absent
  value as `--` and a broken one as `not a number` or `infinite`, the Stat
  turns amber, and the tab names the results that came back non-finite.
- **A spec above its own inlet names the spec.** The engine tests the sum
  first, so a CO2 spec above the CO2 inlet with no H2S in the gas reported
  "no acid gas to remove at these specs", which sends the user to the
  wrong box.

### The amine column is full of amine, F-U1

`contactorDiameter` hard-codes a glycol density of 69.9 lb/ft3, and this
studio called it once for both units, so the amine contactor was sized
against glycol. The AMINES table has carried `sgSolution` since the app
shipped and the sizing never read it. On the app's own amine defaults the
diameter comes out 4.436 ft where the MDEA solution density gives 4.524 ft,
**1.99 percent small**.

The sweetening tab now passes `rhoLLbFt3`, the amine solution at its own
table gravity, derived from the same 8.34 lb/gal of water the engine's own
amine circulation is computed from. **The dehydration tab passes nothing**:
the fluid in a TEG contactor is the glycol the engine already assumes, and
the engine owns the one glycol density in the system, so naming a second
one here is how two densities for one fluid start (F-C3, which the engine
repair resolves to 69.5688 lb/ft3 from a single `TEG_LB_PER_GAL`).

**Until the engine reads that argument the diameter cannot change**, so the
studio reads back, from the Souders-Brown velocity the engine returns, the
liquid density it really used, prints it beside the diameter on both tabs,
and says on the sweetening tab that the column was sized against glycol. No
corrected diameter is computed in the Suite. The gates prove the Suite half
against an engine that honours the argument, and the whole gate file is run
against both the vendored engine and the in-flight engine repair.

The parameter name was agreed with the engine repair, which now takes
`rhoLLbFt3` with the glycol value as its default and returns it. The Suite
also carries `amineSolutionLbFt3`, which is the same arithmetic on the same
two constants as the engine's new `solutionLbPerFt3`; import that and delete
this one once the engine is vendored.

### The correlation branch no published case exercises, F-U2

Both contactors and the JT screening call `dakZ` without a `z`, so the
whole live app runs the default correlation branch, and the contactor
golden passes `z` IN on every case. Swept over the range these boxes
offer (gas gravity 0.55 to 2, pressure 14.7 to 3000 psia, temperature
-100 to 400 F, 1584 combinations):

- 877 combinations sit on the band DAK was fitted over and every one of
  them returns a positive z and a finite diameter.
- 707 are off that band, and `dakStanding` now says so on screen.
- **35 of 8316 combinations in a finer sweep do not converge at all, and
  three of those return a NEGATIVE z**, hence a negative gas density and
  a NaN diameter with no `error` key. At 800 psia, -30 F and gravity 1.25
  the engine reports z = -0.171 and a diameter that used to render as
  `--`. This is reachable from the shipped boxes and is NOT in the recon,
  which reached a negative z only through a caller-supplied `z` and
  recorded that the Suite never passes one.
- Neither engine consumer carries `dakZ`'s `converged` flag out (F-E15,
  F-E16, F-U5), so the studio asks the same published correlation the
  same question with the same arguments and reports the answer. The
  number on screen still comes from the engine.

### Also fixed here

- **The saturated inlet mode said "saturated" and answered from a hidden
  box.** When the saturation fit refused, the tab silently fell back to
  the typed inlet field, which is not on screen in saturated mode, so a
  refused fit was answered from a default nobody had seen. It refuses
  now. Not in the recon.
- **F-U4**: the dew point tab labelled a coefficient computed at the inlet
  pressure only while the march beside it re-read it at twenty pressures.
  The label and the hint say so.

### Meeting the engine repair, which merged while this was written

The FC4-0 engine repair is engines PR #199, engines main `82ec6d4`. It is
NOT vendored here yet: `packages/engines/VENDOR.json` still pins the copy
that predates it, and the vendor pull is its own change with its own
blast radius and its own CI drift gate (`npm run check:engines`). So the
three items below do nothing on the tree as it stands and everything the
day the pin moves. Nothing here needs the two merges to land in a
particular order.

- **`kremserFractionRemoved` changed shape.** It was the one export in
  the module outside the object-carrying-an-error contract, returning a
  bare number, which is exactly why no `if (r.error)` guard downstream
  could see its NaN (F-S1). It returns `{ fractionRemoved }` or
  `{ error }` now. `readFractionRemoved` in the context reads both
  shapes, so neither merge order leaves this studio broken, and the
  refusal reaches the "Removal at the stated stages" card. **Delete it
  and read `.fractionRemoved` directly when the pin moves.**
- **`muMeanFPerPsi` is returned by `jtDrop`.** The dew point card printed
  an inlet coefficient beside a temperature that twenty other
  coefficients produced (F-U4). It prints both now, the inlet one
  labelled as the inlet and the mean one as the coefficient the march
  delivered, and the second appears only when the engine supplies it.
- **Gas above 140 degF is refused by name in the water-content path.**
  The engine repair narrows the Magnus fit to its own docstring's -45 to
  60 degC, where it had been running to 100 degC and reading 1.027157
  times the defining boiling pressure (F-E20). 200 degF used to answer
  and refuses now, and that refusal is visible because of the F-U3 fix.
  The gate asserts the general property rather than one temperature:
  every temperature the box accepts and the fit refuses reaches the
  screen.

The engine repair also moves numbers this studio displays, which it
displays and does not compute. The JT coefficient moves by z. `dropF`
moves by two causes multiplied: 0.863906862 from removing the `/z`, and
1.005172953 from the march being made second order. The second was in no
finding: the old march was midpoint-in-P and Euler-in-T, first order,
understating cooling by 3119 to 6775 ppm always in the same direction,
and no step count could have rescued it because the error goes as 1/n.

The engine also exports `amineSolutionLbPerFt3(amineId)` now, which is
the same arithmetic on the same two constants as this file's
`amineSolutionLbFt3`. Swap to it and delete the local one when the pin
moves.

### Gates

`src/contexts/__tests__/gasProcessingContext.test.jsx` (56) and
`src/components/gasprocessing/__tests__/gasProcessingPanels.test.jsx` (11)
assert numbers and screen text for this app for the first time. **Twelve
defects were planted one at a time and every one was caught by the test
that exists for it**, because a gate that cannot fail is the defect
rather than the proof: this module's engine suite passes 12 of 12 with
the correct Joule-Thomson formula substituted.

The gates assert the studio's own layer rather than the engine's
arithmetic: which arguments reach the engine, and that an input the
engine cannot answer is refused by name. Where a finding is recorded as
"what the engine used to do", the assertion is the version-free
invariant (the engine refuses it, or answers it with something that is
not an engineering quantity) and the measured pre-repair figure is in
the comment, so the FC4-0 engine repair landing beside this one does not
turn these gates red. All 67 pass against the vendored engine and
against the merged engine repair (`82ec6d4`) dropped over it.

Blast radius: `src/components/gasprocessing/fields.jsx` is imported by
three files, all in this studio. The same `NumberInput` and `fmt` pair is
copy-pasted into eighteen other studios' own `fields.jsx`, which are
separate files and are untouched. Six control sweeps over the customary
operating envelope, chosen before any flip was counted, return zero
flips; across 1292 wide-ladder combinations the repair newly refuses 518
and newly answers **none**.

## Open

- Tile rename migration 20260829570000 HELD for the prod upload.
- ARMED literature gates: McKetta-Wehe water-content chart, TEG
  equilibrium/absorption-factor charts, GPSA amine worked examples
  (owner PDFs).
- Engine-side, routed to `fix/fc4-0-gasprocessing` in the engines repo
  rather than patched from here:
  - **F-E1/F-E2/F-E3**, the headline: `jouleThomsonFPerPsi` divides by
    `z` where the relation carries no such factor, so all four Dew Point
    numbers are wrong on the app's own shipped defaults (coefficient 6.6
    against 5.7 F per 100 psi, cooling 27.3 against 24.0 F, downstream
    temperature 72.7 against 76.0 F, water held 31.5 against 35.1
    lb/MMscf). The docstring carries the same error. The studio displays
    whatever the engine returns and will show the corrected figures the
    day it lands.
  - **F-C4**: `contactorDiameter` takes no liquid density. This studio
    already passes `rhoLLbFt3` on both tabs, glycol on dehydration and
    the amine solution on sweetening. The engine reading that argument
    is the whole of the F-U1 repair; nothing further is needed here.
  - **F-E15, F-E16, F-U5**: both engine consumers discard `dakZ`'s
    `converged` flag. The studio now runs the same correlation itself to
    report it, which is a display-layer defence rather than the repair.
  - **F-C7**: `leanTegWtPct` is range-checked, refused outside 90 to 100,
    and then never used. The studio keeps the box because the engine
    still refuses on it; whether it constrains the achievable outlet spec
    or is removed is an engine decision.
  - **F-C1, F-C2, F-C3, F-C5, F-C6, F-C9**: two standard conditions and
    two glycol densities in one file, three constants hidden against the
    module's own doctrine, and a comment naming a latent heat that is not
    in the code.
  - **F-S1**: `kremserFractionRemoved` returns a bare number, so it is
    the one export with no property for a caller to check. The studio's
    bounds keep it out of its NaN branch; the contract is the engine's.
