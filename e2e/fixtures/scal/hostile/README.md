# SCAL Studio hostile lab tables (SCAL-U1, PL2 and RL10)

The same kr table and the same Pc table in several shapes. Each file must
read to its twin (`kr-twin.csv`, `pc-twin-psi.csv`) through
`src/utils/scalstudio/labImport.js`, or be refused with a reason.

| File | What is hostile |
|---|---|
| kr-reordered-extra-columns.csv | columns in another order, a temperature and a comment column |
| kr-semicolon-comma-decimal.csv | semicolon separator, comma decimals |
| kr-percent-no-header.txt | tab separated, no header, Sw in percent |
| kr-vendor-export.csv | title lines, a comment, a blank and an empty row, Sw (%) in the header, a trailing delimiter, an n/a row, an Average row |
| pc-kpa-header.csv | Pc in kPa named in the header |
| pc-bar-units-row.csv | the units on a second header row (bar) |
| pc-semicolon-percent-kpa.csv | semicolons, comma decimals, Sw [%] and Pc [kPa] in square brackets |
| pc-no-unit-no-header.txt | white space, no header and no unit: the unit is chosen at the door |
