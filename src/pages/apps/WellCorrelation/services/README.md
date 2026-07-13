# Well Correlation validation (G3.0)

`sampleSection.js` is the deterministic synthetic 3-well section shared
by the engine tests, the in-memory backend, and the `/dev/well-correlation`
harness — so the Playwright suite asserts exact geometry off the
rendered UI. No RNG: tops are fixed and the GR curve is a closed-form
function of depth.

## Why there is NO Python oracle here

G1 (LAS) and G2 (Archie/porosity) each ship an independent Python
oracle because they implement **numerical methods with a published
reference implementation** (lasio, mincurve, the Archie/Larionov
literature) — a genuine second implementation is the only way to trust
them.

Cross-section geometry is different: datum flattening is **exact
closed-form arithmetic** — a single additive per-well depth shift
(`shift = datum − topMD`) and linear depth→screen mapping. There is no
approximation, no convergence, no reference algorithm to disagree with.
A Python re-implementation would be the same three lines of arithmetic
and would prove nothing. So the validation is:

- **hand-derived analytic jest cases** (the shifts 0 / −40 / +30 for
  flattening the sample section on Top Dome to 1500 m are computed by
  hand in `__tests__/section.test.js`), and
- **structural invariants** (flattening any top makes its correlation
  line perfectly flat across every well that has it; a well missing the
  datum top is flagged and drawn at true MD, never silently mis-hung).

This mirrors the Seismolord `wellPath` / `wellImport` engines, which are
also exact and validated by analytic cases rather than a second oracle.
If G3 later grows an approximate step (e.g. auto-correlation top
snapping), THAT step gets an oracle; the flattening arithmetic does not
need one.

## The sample section (geometry by construction)

Three wells penetrate the same three tops at different MDs, so
structural view shows relief and flattening pins the chosen top flat:

| Well | Top Dome | Mid Shale | Base Sand | note |
|---|---|---|---|---|
| KETA-1 (`corr-w1`) | 1500 | 1580 | 1660 | owned |
| KETA-2 (`corr-w2`) | 1540 | 1610 | 1705 | owned |
| KETA-3 (`corr-w3`) | 1470 | — | 1612 | **org-shared read-only; missing Mid Shale** |

KETA-3 is org-shared and read-only (exercises the RLS-mirroring guards)
and deliberately lacks Mid Shale (exercises the missing-datum-top flag
and the correlation line that skips a well).
