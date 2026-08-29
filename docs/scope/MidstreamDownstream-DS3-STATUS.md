# Refinery Planning & Scheduling Studio (DS3) — status

Phase: DS3 (MidstreamDownstream-ROADMAP.md §6)
Status: **SHIPPED 2026-08-29** (branch feat/downstream-ds3)

The module's headline app, and the first place the shared stream model
built at DS0 earns its keep.

## Doctrine 2, made concrete

Everywhere else, planning and scheduling are separate products with
separate data models. The month is planned in one system, executed
against another, and reconciled by hand in a spreadsheet several weeks
later, by which time the month is over and nobody can act on what it
says.

Here **a plan event, a scheduled event and a recorded actual are the
same shape**, distinguished only by which ledger they sit in. So the
plan cascades into a calendar, actuals are recorded against the same
shape, and variance is a **subtraction** rather than a project.

## The plan

A configuration-level linear programme on the DS0 kernel:

- **maximise** product revenue less crude cost less unit operating cost
- **subject to** a material balance on every stream, unit capacities and
  crude availability as bounds, and product demand floors and ceilings

**Yields are data, not predictions.** A refinery's yields come from its
own assays and unit models, and every planning system in the industry
carries them as inputs. This one does the same rather than pretending to
predict them; DS1 is where a crude's straight-run yields are worked out.

**The material balance is an inequality on purpose.** What is made, less
what units consume, less what goes into products, must be *at least*
zero. A refinery can leave a stream unplaced — to fuel, to storage, sold
as is — and forcing equality would make the plan infeasible for the
wrong reason. What is left over is reported as **surplus**, which is a
real planning output: it is the stream nobody found a home for.

## A sign convention, caught by a test

The solver returns d(objective)/d(right-hand side). The balance row is
written `made − consumed − placed ≥ 0`, so raising that right-hand side
demands *more surplus*, which costs money — the derivative is negative
where the stream is valuable.

But what a planner means by "what is another barrel worth" is the
opposite: a barrel arriving from outside relaxes the row downwards. So
the reported marginal value is negated, and **the reason is written into
the code**, because a marginal value reported with the wrong sign is
silent and expensive.

## The schedule

The plan says how much over the month; the schedule says when. Crude
arrives in cargoes of the size set, units run weekly, lifts spread
across the period. A test asserts the calendar **adds up to the plan it
came from**.

It is deliberately not a berth-level scheduler, and the app says so on
the tab: tank capacity, jetty windows and turnarounds are not modelled.
This is the shape of the month to read actuals against.

## The reconciliation

- Volume and price variance **sum to the total exactly**, which is what
  makes the split worth reporting.
- A movement in one ledger and not the other is listed as **unmatched**
  rather than folded into a price effect: an unplanned cargo is not the
  price of anything.
- A unit below plan is reported as a **gap**, not labelled downtime,
  because the app does not know why.

## Verification

- Jest **403 suites / 5770 tests green** — 24 engine, 9 page.
- `npm run build` clean.
- `20260829900000` (persistence) **APPLIED**; `20260829910000` (tile to
  Active) **HELD** for the DS3 upload.

## Limits, stated in the app

Yields are fixed vectors rather than functions of severity, so it will
not say what happens if the reformer is pushed harder. Quality is not
carried through the plan — that is the blending optimiser's job — so
pooling constraints are absent. One period at a time, with no inventory
carried between periods.

## Next

DS4, the Modular Refinery Feasibility Studio: the flagship
differentiator, consuming DS1 yields and DS3 configurations.
