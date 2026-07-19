# Fluid Systems Studio PR78 engine validation

Validation-first gate for the compositional EOS engine in
`src/utils/fluidstudio/eos/` (plan of record:
`docs/scope/FluidSystemsStudio-STATUS.md`).

## Pieces

- `oracle.py` - independent Python stdlib implementation. Independence by
  route, not just by reimplementation: the compressibility cubic is solved
  by bracketed bisection between its analytic extrema (the JS engine uses
  Cardano + Newton polish); ln(phi) comes from numerical quadrature of the
  residual-Helmholtz integral with dP/dn_i differentiated from the
  pressure-explicit mole-number form (the JS engine uses the closed-form
  fugacity expression, so agreement cross-validates the algebra); pure
  saturation pressure comes from the Maxwell equal-area construction (the
  JS engine iterates fugacity equality). Component constants are read from
  the committed, source-cited table
  `src/utils/fluidstudio/eos/__tests__/componentReference.json` - one
  transcription shared by both sides. The BIP table IS deliberately
  transcribed twice (genfixtures.py vs components.js) and gated for
  equality.
- `genfixtures.py` - regenerates the committed goldens consumed by jest
  and the harness:

      python3 tools/validation/fluidstudio/genfixtures.py
      # writes src/utils/fluidstudio/eos/__tests__/goldens.json

- `run-validation.mjs` - labeled-CASE gate runner (mbal-validation style),
  exit 0 only on full pass:

      node tools/validation/fluidstudio/run-validation.mjs

## Cases

1. BIP table vs the oracle's independent Monograph 20 Table 4-2 transcription
2. Z roots + lowest-Gibbs root selection vs the bisection-route oracle
   (gate 1e-9/1e-10; observed ~1e-15) across three mixtures x T x P,
   including four three-root states that exercise the selection logic
3. ln(phi) closed form vs the quadrature oracle (gate 1e-8 abs, observed
   ~1e-13)
4. Peneloux-translated molar volumes and densities (gate 1e-9, observed
   ~1e-15)
5. purePsat fugacity route vs Maxwell equal-area route, 44 points at
   Tr 0.60-0.95 (gate 1e-7, observed ~1e-12)
6. NIST measured vapor pressures: normal boiling points (CO2 uses the
   0 degC saturation point since it sublimes at 1 atm) with honest
   per-component bands set at ~1.5x observed PR78 error - sub-1% for
   most paraffins, 2.6% iC4, 9.4% H2S (Tr 0.57, known low-Tr PR
   overprediction). Plus the omega-definition identity at Tr = 0.7
   (log10 Pr = -(1 + omega), gate 0.02 abs).
7. Analytic identities: ideal-gas limit, cubic residual at the chosen
   root, split invariance (duplicating a component changes nothing),
   Peneloux touching volumes only (zFactor/lnPhi bit-identical with and
   without shifts) and the correction equaling sum x_i s_i b_i.
8. (FS3) Rachford-Rice: binary closed-form beta, root residual +
   unit-sum + material balance, negative-flash root outside [0,1],
   null when K does not straddle 1.
9. (FS3) Stability + flashPT vs the plain-SS oracle flash grid - the
   oracle uses no GDEM, bisection-only RR and the bisection cubic, so
   both sides converging to the same fixed point cross-validates
   accelerator, RR solver and root selection (gates 1e-8..1e-9,
   observed ~1e-10; 8 two-phase + 31 single-phase states). Every
   two-phase golden is sealed at generation time by the quadrature
   fugacity-equality check (observed 5e-12, generator aborts above 1e-6).
10. (FS3) Convergence identities on live flash results: isofugacity
    (observed ~1e-11), exact material balance, K = y/x = phiL/phiV.
11. (FS3) Low-pressure K limits anchored to the NIST-gated Psat:
    plain Raoult for the heavy component (2%), the Lewis-rule phiSat
    correction for the volatile one (3%) - the light component's
    departure from naive Raoult IS its saturated-vapor fugacity
    coefficient, and the gate verifies exactly that.
12. Published literature flash fixtures (Whitson Monograph 20, Ahmed
    EOS & PVT Analysis) - armed by committing book-typed data to
    literature-fixtures.json; skips with a warning while empty.
13. (FS4) C7+ characterization vs the oracle's second transcription of
    Soreide / Kesler-Lee / Lee-Kesler / Edmister / Jhaveri-Youngren /
    LBC-Vc / Firoozabadi / Chueh-Prausnitz (gate 1e-12, observed
    ~1e-15), plus pure n-alkane recovery: Kesler-Lee run on nC5/nC6
    NIST boiling points + committed GPSA specific gravities must land
    inside honest correlation bands of the FS1 library constants
    (Tc 1%, Pc 8%, omega 0.06 abs; observed 0.06%/5.6%/0.021).
14. (FS4) Characterized-fluid flash grid vs the plain-SS oracle - the
    pseudo is built by each side's own correlation transcription, so
    this seals characterization -> EOS end to end (observed ~1e-12).
15. (FS4) Phase boundaries / envelope vs the oracle's stability-
    bisection route (same scan/bisection protocol, independent
    stability + cubic + RR implementations). Engine and oracle agreed
    on every one of the ~1500 stability probes, so all boundary
    pressures matched exactly; gate kept at 2e-4 rel. Plus the Raoult
    bubble-point band on equimolar C3/nC4 anchored to the NIST-gated
    purePsat (4% observed, 6% band) and flash phase-count flips across
    a detected boundary.
16. (FS4) LBC viscosity + Weinaug-Katz IFT vs the oracle transcription
    of the SPE 109892 field-unit statement (gate 1e-6, observed
    ~1e-10), NIST dilute-gas viscosity anchors (methane/nitrogen at
    300 K / 1 atm, +-10% bands; observed 2.8%/0.9%) and identity gates
    (Herning-Zipperer collapse, zero IFT for identical phases).
17. Coats & Smart SPE 11197 fixtures - armed by committing
    paper-verified compositions + measured saturation pressures to
    literature-fixtures.json (coatsSmart section); skips while empty.

The same gates run in jest (`src/utils/fluidstudio/eos/__tests__/`:
`pr78.test.js`, `flash.test.js`, `characterization.test.js`,
`envelope.test.js`, `transport.test.js`) so CI catches regressions
without Python; this runner is the regeneration-time cross-check and the
place tolerances are documented.

Unarmed literature cases awaiting owner-supplied printed pages: CASE 12
(Whitson/Ahmed worked flash examples) and CASE 17 (Coats & Smart SPE
11197 compositions + measured saturation pressures).
