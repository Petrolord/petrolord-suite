# Recovery Factor Estimator: upgrade working doc

App #10 of the Reservoir round (`docs/scope/AppUpgrade-Reservoir-PLAN.md`).
Route `/dashboard/apps/reservoir/recovery-factor-estimator`, harness
`/dev/studio/recovery-factor`. Branch `feat/rf-u1`. Finding IDs `RF-U1-nnn`
(Step 1) and `RF-U2-nnn` (Step 2).

Code: page `src/pages/apps/RecoveryFactorEstimator.jsx`, state
`src/contexts/RfEstimatorContext.jsx`, panels `src/components/rfestimator/`,
engine `src/utils/recoveryFactorCalculations.js` (Suite-side; it is not in
the canonical engines library, so no engines PR applies), help
`src/components/reservoir/RecoveryFactorHelpGuide.jsx`, table
`saved_rf_projects`.

## Findings (Step 1)

Severity: S1 a wrong number a user would act on; S2 a reviewer cannot sign
or a claim without its event; S3 friction; S4 polish.

| ID | Sev | Check | Finding | State |
|---|---|---|---|---|
| RF-U1-001 | S1 | PL1 | The API (Arps et al. 1967) correlations are written for k in darcies; the engine fed the typed md value straight in. The solution-gas estimate was 1000^0.0979 = 1.97 times too high (sample 34.8 percent, published form 17.7) and the water-drive estimate 1000^0.0770 = 1.70 times (sample 72.0 percent, published form 42.3). The T1 e2e had pinned 72.0. | Fixed: k typed in md, converted to darcies in the engine; gate `recoveryFactorValidation.test.js` |
| RF-U1-002 | S2 | PL4, RL8 | Every method clamped RF to 1 to 95 percent with no word (`clampFraction`): a p/z case with abandonment above initial pressure showed 1.0 percent recovery; an equation above 95 percent showed 95.0. | Fixed: no clamp; a value outside 0 to 100 percent is withheld with its reason; above the analog band is flagged |
| RF-U1-003 | S2 | PL1, RL9 | Analog bands cited as "industry literature"; the help called Low and High "P90 to P10". | Fixed: the band is labelled as transcribed and not validated, Low and High as range edges, never P90 and P10 |
| RF-U1-004 | S2 | RL9 | No input was checked against the domain of its method: abandonment above the bubble point, a porosity typed as 22, Sgr above the gas saturation all computed silently. A correlation used under another drive was not flagged. | Fixed: `correlationInputFlags`, `volumetricInputFlags`, method and drive mismatch flags, on screen and in the report |
