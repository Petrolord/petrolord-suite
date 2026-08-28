# The Fluid Studio EOS validation harness moved

It lives in the central engines repo now, at `tools/validation/fluid/` in
[Petrolord/petrolord-engines](https://github.com/Petrolord/petrolord-engines),
vendored here at `packages/engines/tools/validation/fluid/`.

    node packages/engines/tools/validation/fluid/run-validation.mjs
    python3 packages/engines/tools/validation/fluid/genfixtures.py

It moved with the physics. The Peng-Robinson engine the harness validates was
extracted to `packages/engines/engines/fluid/` in 2026-08, and the Suite's
`src/utils/fluidstudio/eos/*.js` are now re-export shims onto it. Leaving a
second copy of the oracle here would have given two independent Python
implementations of the same reference calculation, free to drift, with nothing
to say which was authoritative.

What the harness covers is unchanged: 274 gates, an independent Python oracle
reaching the same numbers by different routes, the NIST vapor pressures, and
three armed literature anchors (Whitson & Brule Monograph 20 App. B Problem 18,
the eight Coats & Smart SPE 11197 fluids, and Good Oil Well No. 4 / Core Labs
RFL 88001).

The test goldens moved with it, to `packages/engines/test-data/fluid/`. The
Suite's own EOS test suites remain in `src/utils/fluidstudio/eos/__tests__/`
and read those goldens through the vendored path: they are the consumer-side
check that the shim wiring is intact, which is the same arrangement every
earlier extraction left behind.
