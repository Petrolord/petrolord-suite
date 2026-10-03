# DCA hostile file set (DCA-U1, PL2)

Every file is Ekene-1's primary decline (packages/engines/test-data/ekene-dynamic/rates.json: 120 bopd, 0.0012 per day, exponential, 2020-01 to 2022-12) in another shape. Read through the import door, each must give the twin's rates or say why it cannot.

| File | What it tests |
|---|---|
| `01-clean.csv` | The twin: ISO dates, oil bbl/d, gas Mscf/d, water bbl/d (Ekene-1 primary decline, 36 months) |
| `02-semicolon-decimal-comma.csv` | Semicolon columns, decimal commas, columns in another order, units in brackets |
| `03-day-first-unsettled.csv` | Day-first dates that are all on the 1st: nothing settles the order, so the door asks |
| `04-day-first-settled.csv` | Day-first dates on the 15th: the order is settled by the file |
| `05-monthly-volumes.csv` | Monthly volumes, the time named in the header: read as calendar-day rates (volume over the days in the month) |
| `06-bare-volume-unit.csv` | A volume unit with no time ("oil_bbl"): rate or monthly volume is asked, never guessed |
| `07-metric-rates.csv` | SI rates: sm3/d oil and 10^3 sm3/d gas, converted at the door |
| `08-title-and-totals.csv` | Two title lines above the table and a totals row under it: both left out and listed |
| `09-two-wells.csv` | Two wells in one file: refused with the names |
| `10-zero-negative-blank.csv` | A shut-in month (0), a negative allocation (-5), a blank and an n/a: kept, counted, and left out of the fit |
| `11-tab-month-names.txt` | Tab columns, month names ("Jan 2020"), a cumulative column the app does not use (listed as not used) |
