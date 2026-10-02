# Fluid Systems Studio: hostile P-T profile files (FLUID-U1, PL2 and RL10)

The flowline pressure and temperature profile is the one door of the app that
takes pasted or file text. Each file here is the same six points as
`twin-psia-degF.csv` in another shape, so a test can import it and compare
with its twin.

| File | What is hostile about it |
|---|---|
| `twin-psia-degF.csv` | The plain form every saved project holds: psia, degF, comma |
| `tabs-header-bar-degC.txt` | Tab separated, a header with the units, bar and degC |
| `semicolon-comma-decimals.csv` | Semicolon separated with comma decimals |
| `swapped-columns-kpa.csv` | Temperature first, an extra column, kPa and degC in square brackets |
| `spaces-psig.txt` | Space separated, gauge pressure |
| `no-header-bar-degC.txt` | bar and degC with no header: the unit is chosen at the door |
| `hostile-mixed.txt` | A header that names neither column, a unit typed in a cell, one value, comma decimals with a comma separator, a negative pressure |

Read by `src/components/fluidstudio/__tests__/fluidContract.test.jsx` and
`e2e/fluid-systems-upgrade.spec.js`.
