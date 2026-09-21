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

## Engines 82ec6d4 vendored (FC4-0), 2026-09-16

The pin in `packages/engines/VENDOR.json` moved from `cac92ab` to
`82ec6d4`, engines PR #199. Five canonical paths, and the import
closure needs nothing else: `R_UNIVERSAL` and `AIR_MW` from
`production/gasProperties.js` and the four DAK window constants from
`facilities/separatorSizing.js` were already exported at the previous
pin. `npm run check:engines` is clean with an EMPTY ledger, 742 paths
compared byte for byte, and the `--ahead` advisory reports level.

### The four Dew Point numbers, measured on the studio itself

Rendered from `DewpointResults` inside the real provider on the app's
own shipped defaults (1000 to 600 psia, 100 F, gravity 0.65, Cp 9.5),
before and after the pin moved and with nothing else changed.

| On screen | Before | After | Cause |
| --- | ---: | ---: | --- |
| JT coefficient at the inlet | 6.6 F/100 psi | **5.7** | the relation carries no 1/z; the ratio is exactly z (0.87103) times an exact Btu packaging (0.99999941) |
| Cooling across the drop | 27.3 F | **24.0** | the same, and a march that is second order now |
| Downstream temperature | 72.7 F | **76.0** | the cooling |
| Water the cold gas can hold | 31.5 lb/MMscf | **35.1** | the downstream temperature, through the saturation fit |
| JT coefficient, mean over the drop | not shown | **6.0 F/100 psi** | new card, `muMeanFPerPsi`, live with this pin |

It was anti-conservative in the direction that matters. A dew point
skid is bought for its cooling, so a coefficient 15 percent high sold a
depression the skid does not deliver.

### The blast radius

The grid and the nine controls were written to a timestamped file
BEFORE any sweep ran. **18,075 points across all three tabs**, driven
through the real `GasProcessingProvider` by `setSection` and read off
the context exactly as the panels read it, plus a **35,910 point**
engine-level probe for the z-factor door. Newly refused is counted
separately from newly moved, and a point refused on BOTH trees is a
control that behaved rather than a finding.

| Tab | Points | Refused on both | **Newly refused** | **Newly answered** | Answered on both | Printed cell moved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Dehydration, saturated inlet | 5184 | 2592 | **648** | **0** | 1944 | 1944 |
| Dehydration, typed inlet | 576 | 0 | **0** | **0** | 576 | 576 |
| Sweetening | 8640 | 0 | **0** | **0** | 8640 | 8640 |
| Dew point | 3675 | 0 | **210** | **0** | 3465 | 3465 |

Every printed cell that moves, with a named cause and a ratio:

| Cell | Points moved at printed precision | Ratio | Cause |
| --- | ---: | --- | --- |
| Dehydration inlet water, water removed, BTEX | 180 of 1944 | 1.0000169391883849 exactly | one standard base: 379.49 became the derived 379.48357185628737 |
| Dehydration contactor diameter | 216 | 1.003087 to 1.003581 | two causes multiplied: the base, sqrt(14.696/14.65 x 520/519.67) = 1.0018867, and glycol at 69.5688 lb/ft3 instead of a typed 69.9 |
| Dehydration liquid named on the card | 1944 | 0.99526225 exactly | 9.3 lb/gal x 1728/231 against the typed 69.9 |
| Sweetening acid gas, circulation, reboiler duty | 2880 / 160 / 0 | 1.0000169391883849 exactly | the same standard base |
| Sweetening contactor diameter | 7308 | 1.020955 to 1.045896 | the base, and the column being sized against its own amine solution at last |
| Sweetening liquid named on the card | 8640 | 0.901451 to 0.928227 | amine solution density instead of glycol |
| Dew point JT coefficient | 3465 | 0.2516 to 0.9765 | z at the inlet, times the exact Btu packaging |
| Dew point cooling and downstream temperature | 3002 | see below | the coefficient, and a second-order march |
| Dew point water the cold gas can hold | 1859 | 1.0014 to 1.2028 (median 1.20) on plausible-before points | the downstream temperature |

**The cooling, characterised rather than counted.** On the 2932 points
whose pre-vendor answer was physically plausible, the cooling falls on
**100 percent** of them, by a median 3.75 F and at most 116 F, and the
downstream temperature rises by exactly as much. `dropF` moves by TWO
causes multiplied, and they pull opposite ways: removing the 1/z takes
cooling out, and making the march second order puts a little back.
Measured at 100 F on a 0.65 gravity gas, the old 20-step march
understated its own converged answer by 4242 ppm on 1000 to 600 psia,
6478 ppm on 1000 to 400 and 5112 ppm on 850 to 300, always in the same
direction, and halving with each doubling of the step count, which is
first order. The new march lands at 0.8, 3.1 and 3.8 ppm and quarters
with each doubling, which is second order.

**352 of 3675 dew point points had a physically absurd answer before.**
The worst printed a cooling of **34,912,209,958 F** with no error at
all, because the old march walked below the correlation's validity
floor and kept going. After the pin, every one of them is a named
refusal. This was not in the brief and the sweep found it.

**What the 140 F refusal removes from the shipped range.** The Magnus
fit's guard ran to 100 C, where it reads 1.027157 times the DEFINING
vapour pressure of water at its own normal boiling point. It is now the
60 C its docstring always claimed, which is exactly 140 F. The
temperature box still accepts -100 to 400 F, so the band the studio
loses is **(140 F, 212 F]**: above 212 F the fit already refused, and
the cold edge at -49 F has not moved. On the dehydration tab in
saturated inlet mode that is the whole 160 F slice of the grid, 648
points, refused by a message that names 60 degC, 140 degF and the value
typed. On the dew point tab the water card is a second door: **722**
points lose it because the outlet now lands above 140 F, and **155**
GAIN it because the corrected, smaller cooling brings an outlet that
used to fall below the -49 F floor back inside the band. A further 88
lose it because the march itself refuses.

**Newly refused, in full, and never added to the moved counts.**

| Event | Count | Message |
| --- | ---: | --- |
| Dehydration tab refuses | 648 | the Magnus fit band, named, with the value in degC |
| Dehydration contactor card only | 36 | Tpr below the DAK floor, at a gravity of 1.0 and -20 or -40 F |
| Dew point tab refuses | 210 | Tpr below the DAK floor at the inlet (0 and 20 F on a 1.2 gravity gas) |
| Dew point march only | 448 | the march refuses partway down, naming the step, the pressure and the temperature it died at; 267 of these were absurd before and 181 looked plausible |
| Dew point water card only | 810 | 722 above 140 F, 88 behind the march |
| **Newly answered anywhere** | **155** | the water card, at the cold end |
| **Newly answered whole tabs** | **0** | |

### The negative z, answered

The brief carried three Suite-reachable points returning a negative z.
A 35,910 point engine probe (200 to 3000 psia, -100 to 0 F, gravity
0.55 to 2.00) finds **55** states where the pre-vendor
`contactorDiameter` returns a negative z, **82** where it returns a
diameter that is not a number, and **zero** where it returns an error
key. At the brief's own point, 800 psia, -30 F, gravity 1.25, it
reports z = **-0.17082424414878106**, a gas density of -36.77 lb/ft3
and a NaN diameter, with `dakZ` reporting `converged: true`.

After the pin the engine **refuses** them by name: "Tpr 0.876 against
1.0 is below the DAK validity range of 1.0 to 3.0, at 800 psia and -30
degF". Over the same 35,910 points: **0** negative z, **0** NaN
diameters. The studio's own independent `dakStanding` check stays, and
a new gate sweeps 2,880 states asserting the version-free invariant
that the contactor either carries an `error` or every number it returns
is an engineering quantity.

### Suite changes that ride with the pin

- The `readFractionRemoved` compatibility reader is **gone**, as its own
  comment instructed. `kremserFractionRemoved` carries the module's
  error contract now and is read directly. Its gate was rewritten to
  assert the CONTRACT rather than either shape.
- `amineSolutionLbFt3`, `WATER_LB_PER_GAL` and `GAL_PER_FT3` are gone
  from the context; the amine column's density comes from the engine's
  `amineSolutionLbPerFt3`. The Suite no longer keeps a second copy of
  the water density the amine circulation is divided by.
- `DAK_BAND` is imported from `separatorSizing.js`, which declares the
  window. The studio, the gas-processing engine and the separator now
  read one owner instead of three copies of four numbers.
- The Water balance card shows the loop water balance the repaired
  `leanTegWtPct` buys: the rich glycol strength returning and the water
  the lean glycol already carries. That input was validated and then
  never read, and without this it would still move nothing a user sees.
- The dew point memo composes the inlet note and the march note
  explicitly instead of letting a spread decide. Nothing measured
  moves; the two agree wherever both are set, because the march's first
  evaluation is at the inlet.
- The sweetening liquid note is reworded. It fires on zero of 8,640
  points now, which is the point of it, and it stays as a CHECK: the
  density is read back out of the engine's own Souders-Brown velocity,
  so a column ever sized against a liquid other than the one it was
  given still says so. Worst read-back gap over the grid: 3.4e-16.

### The nine controls, all registered in advance, all green

| | Control | Result |
| --- | --- | --- |
| C1 | sweetening molar quantities move by exactly 1.0000169391883849 | PASS, worst miss 4.4e-16 over 25,920 assertions |
| C2 | the standard base moves the SATURATED inlet and not the TYPED one | PASS, both halves; typed inlet bit-identical on 2,304 assertions |
| C3 | contactor diameter equals the closed form of its two named causes | PASS, worst miss 4.4e-16 over 11,124 points |
| C4 | JT coefficient ratio equals z at the inlet times the Btu packaging | PASS, worst miss 5.6e-16 over 3,465 points |
| C5 | the march is second order now and the old one was short, one-directionally | PASS, 4242/6478/5112 ppm before against 0.8/3.1/3.8 after |
| C6 | the 140 F refusal is one-directional and named | PASS, 0 refusals at or below 140 F, 0 tabs newly answered |
| C7 | the Kremser contract change moves no number | PASS, bit-identical on 2,520 points |
| C8 | the negative z is refused, never returned | PASS, 55 to 0 |
| C9 | nothing moves without a named cause | PASS |

Two figures in the canonical FINDINGS do not reproduce and are recorded
here rather than repeated. The amine column correction is quoted as
1.94 percent; measured on MDEA's own shipped defaults it is **1.87
percent** against the engine's resolved 69.5688 lb/ft3 of glycol and
**1.99 percent** against the 69.9 the Suite used to be sized by, and
the two figures FINDINGS itself gives imply 1.99. The march's claimed
3119, 4816 and 6775 ppm do not reproduce at the studio's own gas; the
measured figures are above, and they are in band and one-directional,
which is what the control was written to gate. Both were gated as bands
rather than on the digits, which is why neither blocked the pass.

## Open

- Tile rename migration 20260829570000 HELD for the prod upload.
- Prod upload and any `supabase functions deploy` are the owner's and
  stay held.
- ARMED literature gates: McKetta-Wehe water-content chart, TEG
  equilibrium/absorption-factor charts, GPSA amine worked examples
  (owner PDFs).
- The dew point tab has no door check on the temperature against the
  water fit, the way the dehydration tab does through its saturated
  inlet. A user who types an upstream temperature whose OUTLET lands
  above 140 F sees the water card refuse rather than the box. That is
  correct and named, and a door check would be an improvement.
- `waterOverheadBtuPerLb` and the contactor liquid density are engine
  INPUTS since FC4-0 and the studio types neither; both run on the
  engine defaults, which are now on screen for the overhead.
