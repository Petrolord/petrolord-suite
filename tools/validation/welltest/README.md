# Well Test Analysis engine validation

Validation-first gate for the PTA engines in `src/utils/welltest/`
(plan of record: `docs/scope/WellTestAnalysisStudio-PLAN.md`).

## Pieces

- `oracle.py` - independent Python stdlib implementation: Bessel functions
  from integral representations (the JS engine uses Abramowitz-Stegun
  polynomial fits, so agreement cross-validates both), E1, exact rational
  Stehfest weights, and the homogeneous wellbore-storage-and-skin model.
- `genfixtures.py` - regenerates the committed goldens consumed by jest and
  the harness:

      python3 tools/validation/welltest/genfixtures.py
      # writes src/utils/welltest/__tests__/goldens.json

- `run-validation.mjs` - labeled-CASE gate runner (mbal-validation style),
  exit 0 only on full pass:

      node tools/validation/welltest/run-validation.mjs

## Cases

1. Stehfest vs known transform pairs
2. Special functions vs the oracle (Bessel gate 2e-6, E1 1e-12)
3. Analytic identity gates: storage unit slope pwD = tD/CD, radial semilog
   0.5(ln tD + 0.80907) + S, skin additivity, Bourdet plateau 0.5
4. pwD(tD) vs oracle goldens across storage/skin cases (gate 5e-3; the
   ceiling reflects Stehfest cancellation amplifying the ~1e-7 Bessel
   approximation difference at early time, typical agreement is ~1e-6)
5. Drawdown fixture round trip: MDH and auto-fit recover k, s, C
6. Buildup fixture round trip: Horner (k, s, p*) and auto-fit
7. Published literature fixtures (Dake Fundamentals Ch. 7 Horner example,
   Lee Well Testing examples): armed by committing
   `literature-fixtures.json` with data typed from the books and citations.
   HARD GATE: WT2 merges only after this case is armed and green.
8. WT3 model library analytic truths (Gringarten and Cinco-Ley constants,
   Warren-Root lines and dip, boundary-family limits, composition identity)
9. WT4 gas and multi-rate (Ahmed Ex. 6-7 pseudo-pressure table, Ex. 8-2
   deliverability, equivalent-FVF identity, Odeh-Jones round trip)
10. WT6 closed rectangle: image-lattice Laplace route vs an independent
    real-time theta-duality oracle (`rect_pd_time`), Dietz shape factors
    recovered from the extracted PSS intercept (square 30.8828,
    2:1 21.8369, 4:1 5.379), thin-rectangle = channel degeneracy, and an
    off-center auto-fit round trip (k, skin, drainage area)
11. WT7 horizontal well: mode-plus-image Laplace route vs an independent
    real-time erf x theta oracle (`hw_pd_time`), vertical-radial plateau
    hD/4, pseudoradial plateau 0.5, thin-slab = Gringarten fracture plus
    the exact partial-penetration pseudo-skin, the dimensional plateau
    identity 70.6 qBmu/(Lw sqrt(kh kv)), and an auto-fit round trip
    (k, kv/kh, Lw, skin)

`literature-fixtures.json` shape:

```json
{
  "buildups": [
    {
      "citation": "Dake (1978) Fundamentals, Example 7.x",
      "reservoir": { "phi": 0, "mu": 0, "ct": 0, "rw": 0, "h": 0, "B": 0, "q": 0 },
      "tp": 0,
      "pwfShutIn": 0,
      "points": [{ "dt": 0, "pws": 0 }],
      "expected": { "k": 0, "skin": 0, "pStar": 0 },
      "tolerances": { "k": 0.05, "skin": 0.5, "pStar": 10 }
    }
  ]
}
```
