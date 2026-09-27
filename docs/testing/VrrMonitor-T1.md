# Voidage Replacement Monitor: senior test T1

- App: Voidage Replacement Monitor (Reservoir Management)
- Wave / position: Wave 7, #87 (Senior Testing Programme; reservoir, ML and assurance)
- Build tested: main (Wave 6 merged) plus #718 to #720
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: VRR in reservoir barrels (oil x Bo + water x Bw + free gas x Bg against injection), cumulative, instantaneous and rolling, against the operator's target band
- Coverage before T1: VRR engine and ledger tests (26 in the filtered run); no human walk

## How it was tested

I used `/dev/studio/vrr` at 1366 x 768 with the sample wells (12
well-rows: 2 producers and 2 injectors over three months). The fluid
properties are Bo 1.25, Bw 1.02, Bg 0.9 and Rs 550, with a 1.00 to 1.20
target band.

## Verdict

**Demo-ready after T1. It was S2 before: the headline status contradicted
the operator's own target band.**

- Produced voidage: oil x 1.25 + water x 1.02, with no free gas (Rs x oil
  exceeds the produced gas every month). That is 21,810 + 20,955 + 20,100
  = **62,865 RB**.
- Injected: 53,000 bbl x 1.02 + 6,000 Mscf x 0.9 = **59,460 RB**, so the
  cumulative VRR is **0.946**.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| VRR-T1-001 | S2 | With a 1.00 to 1.20 target band, a cumulative VRR of 0.95 and "2 / 3 periods out", the status read "Balanced — voidage is being replaced; effective pressure maintenance". The engine classifies on fixed 0.9 / 1.1 screening bands and ignores the band the operator set. The ledger's row colours did the same. | The headline and the row colours answer against the user's band ("Below your target band (1.00 to 1.20): produced voidage is not being fully replaced"). The engine's reading stays beneath as a screening line, with its dashes turned into plain punctuation. |
| VRR-T1-002 | S3 | The trend chart clipped its "VRR = 1" label and the last month's tick at the right edge. Empty values were marked with em dashes. | Label inside the plot, axis padding on all three charts, and "-" for empty values. |
| VRR-T1-003 | S3 | The target band and fluid property labels were not tied to their inputs. | Linked. |

## Tests

- `e2e/vrr-monitor-t1.spec.js` checks:
  - 62,865 and 59,460 RB;
  - the status is below a 1.00 to 1.20 band, and within once the minimum
    is 0.90;
  - no em dash on the page.
- VRR jest passes (26 in the filtered run).
- Engine follow-up (after NAPE): `classifyVRR` could take the operator's
  band, and its labels carry em dashes (vrr.js).
