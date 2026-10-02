# Wellsite Studio hostile import files (upgrade U2-003, PL2)

Mudlogging exports as they arrive. Read by
`src/pages/apps/WellsiteStudio/__tests__/upgradeU2Import.test.jsx` through the
shipped importer (`services/mudlogImport.js`) and by `e2e/wellsite-u2.spec.js`.

| File | What is hostile about it |
|---|---|
| `mudlog_depth_ft_reordered_units_in_header.csv` | Field units (ft, ft/hr, klb, psi, gpm, ppg, percent); depth is the fourth column; extra columns (sample number, lithology code, remarks); units in round brackets in the header |
| `mudlog_time_dayfirst_semicolon_comma_decimal.csv` | Time based; semicolons; comma decimals; day-first dates (07/09/2026 is 7 September, ambiguous by itself); metric (m, m/hr, tonnes, bar, L/min, sg, ppm); hole depth and bit depth both present; a connection with the pumps off |
| `mudlog_no_header.txt` | No header at all, columns separated by spaces: the user says what each column is |
| `mudlog_las20_nulls_min_per_ft.las` | LAS 2.0; -999.25 nulls; ROP written as min/ft (an inverse unit); vendor mnemonics (ROPA, WOBA, TGAS, METH, ETH, PROP, MDIA); gas in uncalibrated units |
| `mudlog_vendor_tab_units_row_chromatograph.txt` | Tab separated; quoted headers; units on a second line; C1 to C5; kft.lb torque; one row with no depth and a trailing "END OF REPORT" line |
| `mudlog_las30_comma_metric.las` | LAS 3.0, comma delimited, metric |

A file at real size (10,000 rows) is generated inside the test.

## WITSML files (upgrade U2-011), in `witsml/`

| File | What is hostile about it |
|---|---|
| `trajectory_prefixed_ft_rad.xml` | Every element carries a namespace prefix; depths in feet; one station's angles in radians; stations out of depth order; one station with no uom on its depth; azimuths from true north |
| `log_vendor_units_nulls.xml` | Vendor mnemonics (ROPA, WOBA, MDIA); WITSML unit spellings (ft/h, klbf, lbm/galUS); a null value of -9999 and an empty cell; a gas curve in a unit the door does not know (Euc) |
| `mudlog_intervals_mixed.xml` | Feet; a lithology that is not in the vocabulary; percentages that do not add up; a depth with no uom; a single lithology with no percentage and an alias (SH) |
| `broken_cut_short.xml` | Truncated mid-element |
| `witsml20_trajectory.xml` | A WITSML 2.0 object |
| `well_object_not_supported.xml` | A valid 1.4.1.1 file of an object this reader does not take |
