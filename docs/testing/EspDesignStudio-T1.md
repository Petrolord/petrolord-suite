# ESP Design Studio: senior test T1

- App: ESP Design Studio (`/dashboard/apps/production/esp-design-studio`)
- Wave / position: Wave 4, #46 (Senior Testing Programme; production)
- Build tested: main ec45ddcff plus #672 and #673
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: SubPUMP, Prosper ESP, AutographPC (reference-stage level)
- Coverage before T1: engine goldens (espDesign, espPump, espMotorCable); no human walk

## How it was tested

I used `/dev/production/esp` at 1366 x 768. The studio's default duty is
300 stb/d of oil at 90% water, a 200 psia wellhead, the pump at 7,000 ft
TVD, and a 250 hp, 2,400 V, 67 A motor on 7,200 ft of cable. I walked the
design, pump curve, performance, electrical and diagnostics tabs.

## Verdict

**Demo-ready after T1 (no S1).** I checked these numbers by hand:

- TDH: 3,158 - 1,400 = 1,758 psi, and 1,758 / 0.420 = 4,183 ft. The
  split is 3,670 ft lift + 476 ft wellhead + 37 ft friction.
- Power:
  - hydraulic: 3,115 bbl/d in situ x 1,758 psi x 1.7e-5 = 93 hp;
  - shaft: 93.2 / 0.685 = 136.1 hp;
  - motor load: 136.1 / 250 = 55%;
  - input: 136.1 x 0.7457 / 0.85 = 119.4 kW (119.7 shown, within the
    rounding of the displayed values).
- Cable: sqrt(3) x 36.6 A x 0.1951 ohm/kft x 7.2 kft = 89.0 V (3.71%).
  Surface kVA is sqrt(3) x 2,489 V x 36.6 A = 157.8.
- Gas: Rs 120 scf/stb at 1,400 psia and 184 F equals the produced GOR,
  so there is no free gas and 0.0% through the pump is right.
- System curve: it settles at 301 stb/d against the 300 designed, because
  the stack is 13 ft over on the rounded-up stage count.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| ESP-T1-001 | S2 | The Electrical tab printed "at -- percent motor efficiency" and "over -- ft at -- F" with 85, 7,200 and 180 entered. The panel's formatter only accepted numbers, and the form values are strings. | Coerced: "at 85 percent motor efficiency", "over 7,200 ft at 180 F". |
| ESP-T1-002 | S2 | The system curve's rate axis printed float noise ("76.66666666666667", "728.3333333333333") and started mid-range. | Axis from 0 with whole-number ticks. |
| ESP-T1-003 | S3 | Legends on the pump curve and system curve sat on the axis titles. | The chart-standard legend band and axis-title height, swept across the production studios (choke, ESP, rod pump, surveillance, gas well, allocation, gas lift; 18 chart files). |
| ESP-T1-004 | S3 | "the rest of the produced 120 scf/stb is free" printed when none was free. | Says "all of the produced 120 scf/stb, so no gas is free at the intake", or states the free amount. |
| ESP-T1-005 | S3 | The six-tab header left the title as "ESP De...". "2 AWG selected" wrapped. | Tabs tighter below 2xl, and the title keeps at least 6rem ("ESP Design ..."). The conductor cell stays on one line. |

## Tests

- `e2e/esp-design-t1.spec.js` checks TDH, the free-gas sentence, the
  electrical hints, the cable drop, and a clean system-curve axis.
