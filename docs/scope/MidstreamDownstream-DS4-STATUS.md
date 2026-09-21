# Modular Refinery Feasibility Studio (DS4) — status

Phase: DS4 (MidstreamDownstream-ROADMAP.md section 6)
Status: **SHIPPED 2026-08-29**; this file was missing and was written at MD2-0.

A feasibility screen for a modular refinery: capital scaled from a
reference point on both the six-tenths law and the near-linear modular law,
a product slate from a configuration's yields, annual streams, supply
scenarios, a licensing tracker, and an NPV from the Suite's screening
economics engine.

## MD2-0 validation and repairs (2026-09-19)

Before the NextGen course MD2 (engines #219, vendored at a1d8c9f; findings in
`packages/engines/tools/validation/downstream/FINDINGS-refinery.md`).

- **The NPV threw away the construction-year tax loss.** The capital is
  expensed while the plant is being built and earns nothing, and the loss
  was not carried forward. A profitable hydroskimmer (the defaults with
  crude at 74) read an NPV of -12.2 MM; it is +5.3 MM. A conversion plant at
  20,000 bpd read 67.5 MM; it is 104.1 MM. At the page's own defaults the
  plant never makes a taxable profit and the NPV (-97.4 MM) is unchanged.
- **Revenue went into the economics engine as a negative operating cost,**
  so the Royalty box changed nothing. The wiring now lives in the engine
  (`feasibilityEconomics`) and passes revenue as revenue. **The Royalty box
  is removed**: a royalty is a charge on producing petroleum, and a refinery
  buys its crude.
- **Blank money and size boxes were zero** (a blank crude price made crude
  free). They are refused by name; a utilisation typed as a percentage is
  refused rather than clamped to 100 percent; with no construction period the
  capital is spent in year 0 instead of vanishing.

Decisions taken under the owner's delegation: the loss carry-forward is an
opt-in of the canonical screening engine (off for every other caller, whose
goldens are unchanged); no royalty on a refinery.

Tests: a page test pins the default NPV and the absent Royalty box, and one
pins +5.3 MM with crude at 74; the second fails on the old page.
