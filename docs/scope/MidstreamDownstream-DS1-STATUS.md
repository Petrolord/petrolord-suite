# Crude Assay & Blending Studio (DS1) — status

Phase: DS1 (MidstreamDownstream-ROADMAP.md §6)
Status: **SHIPPED 2026-08-29** (branch feat/downstream-ds1)

The Midstream & Downstream module's first application, and the first of
its ten tiles to leave Coming Soon.

## What it answers

Four questions about a barrel: what it turns into when you distil it,
what happens to the properties when you mix two crudes, whether the
mixture will drop asphaltenes in a tank, and what it is worth against
the crude you already buy.

## The engine

`packages/engines/engines/downstream/crudeAssay.js`, 47 tests.

### Each property blends on its own basis, and the code enforces it

This is the substance of the app. Blend arithmetic fails **silently**:
average the wrong quantity on the wrong basis and the answer looks
plausible and is wrong by a few percent, which on a cargo is real money.

| Property | Basis | Why |
|---|---|---|
| Density | **Volume** | Mass is conserved and volume is assumed to be. |
| Sulfur, TAN, nitrogen, metals | **Mass** | They are quantities per unit mass. Given volumes, the mass fractions come from the densities. |
| Viscosity | **Refutas index, on mass** | It is wildly non-linear in composition. |
| **API gravity** | **Never averaged at all** | It is a hyperbola in density. |

The API case is the one worth stating plainly. A 50/50 volumetric blend
of 20 and 40 API is **29.38, not 30**. Six tenths of a degree sounds
like nothing and is the difference between two grades on a price sheet.
Every API in the app is computed by converting to specific gravity,
blending that, and converting back, and the UI prints the basis beside
the number.

**That test caught its own author.** The case was first written
asserting 28.62, a wrong remembered number. The derived assertion sitting
beside it did not accept the engine's 29.38 as matching 28.62, so the
literal failed while the identity passed. The engine was right; the
remembered figure was not. It is exactly the failure mode the E-series
doctrine of "identities, not remembered numbers" exists to catch, and it
is recorded here because it worked.

### Viscosity

Refutas: `VBI = 14.534 ln(ln(nu + 0.8)) + 10.975`, blended on mass and
inverted. A 50/50 of 10 cSt and 1000 cSt is around 100 cSt, not 505; a
studio reporting the linear average would size the wrong pump and the
wrong heater. Where a component viscosity is missing or below about
0.2 cSt, where the index is undefined, the app reports **no** blended
viscosity rather than quietly blending the rest.

### Stability screening

With a SARA analysis on every crude the app forms the **colloidal
instability index**, saturates plus asphaltenes over aromatics plus
resins, because saturates precipitate asphaltenes while aromatics and
resins hold them. Below about 0.7 screens stable, above about 0.9
unstable, between is where blends go either way.

Without SARA it falls back to a gravity-contrast heuristic **and says
that is what it did**. A screening result whose basis is unstated
invites more confidence than it has earned. This is a strict upgrade on
the Fluid Studio screen it takes after, which is API-contrast only; that
one is honestly labelled and stays as it is.

### Cut yields

A cut's yield is the volume between its boiling bounds off the TBP
curve. Two decisions worth recording:

- The curve **clamps rather than extrapolates** past its measured ends,
  because extrapolating a distillation curve invents yield.
- A cut set that does not cover the whole curve is **reported as not
  closing to 100** rather than scaled up. Scaling would hide the gap.

The blend's own curve is built by mixing the components' **yields** at
each temperature, which is the additive quantity. Averaging their
temperatures would mean nothing.

### Netback

The barrel's value is its own yields times each cut's price, less
losses, processing and freight, so the valuation follows the assay
rather than a rule of thumb about gravity and sulfur. Every term is
reported separately, because the argument with a seller is always about
one of them, and a cut with **no price is named** rather than counted as
free: a missing price silently treated as zero understates the crude and
loses the argument for the wrong reason.

### What is deliberately absent

- **D86 to TBP interconversion.** The API Technical Data Book procedure
  is a published coefficient table, and reproducing published tables from
  memory is what this package refuses, the same rule that keeps the
  relief-valve chart factors as typed inputs. The function ships with
  the mechanism and **no default coefficients**, so it refuses until a
  caller supplies the table and says so in the error. It matters less
  than it sounds: a crude assay is a TBP distillation (D2892, D5236) in
  the first place, and D86 is a product test.
- **Pour point blending**, for the same reason.

Both are stated in the app's own help guide, not just here.

## The app

Studio kit throughout: saved studies with autosave (migration
`20260829860000`, **applied**), notifications, and a help guide written
against what the engine does. Two tabs, blend and stability on one,
yields and netback on the other, with ChartFrame charts on the Suite
standard. Everything on screen is derived; a saved study is its inputs
and nothing else, so reopening one cannot show numbers that no longer
follow from it.

9 page tests, including that every property shows the basis it was
computed on and that the stability screen names its basis.

## A general routing defect fixed on the way

`ApplicationsGrid` built an app's route from `master_apps.module`, which
is a **display name**. That worked only because every module until now
happened to be a single lowercase word, and React Router matches
case-insensitively, so "Facilities" reached "facilities". "Midstream &
Downstream" is not one word: it would have produced a URL containing a
space and an ampersand, matching nothing, and the module's tiles would
have been unclickable.

The module segment is slugified now. It is a no-op for the existing
seven and it stops the next multi-word module hitting the same wall.

## DS0's two deferred items, picked up

DS0 deliberately left the module unpriced and the marketing at "seven
modules", because every app in it was Coming Soon and selling or
advertising an empty module is what the honest-catalog rule prevents.
DS1 shipped an app, so both move:

- The module is priced in all three tables, at the bottom of each
  table's own range, and each records why it was absent before.
- Home, Solutions and the module showcase move to **eight**, with the
  showcase count at **1 of 10**: the number that works, not the number
  planned. The other nine appear as each ships.

## Verification

- Jest **399 suites / 5693 tests green** (47 engine, 9 page, 21
  registration).
- `npm run build` clean.
- `20260829860000` **APPLIED** after a rollback-wrapped dry run; probe
  shows RLS enabled with one owner policy.
- `20260829870000` (tile to Active) **HELD** for the DS1 upload.

## Next

DS2, the Product Blending Optimizer: the first consumer of the LP kernel
built at DS0, solving least-cost recipes under octane, RVP, sulfur and
flash specifications.
