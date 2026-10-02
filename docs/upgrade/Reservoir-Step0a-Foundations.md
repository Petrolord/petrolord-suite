# Reservoir round, Step 0a: platform foundations

2026-10-02, branch `feat/reservoir-step0a`. Plan:
`docs/scope/AppUpgrade-Reservoir-PLAN.md`, Step 0a. Three shared pieces that
every Reservoir app round then adopts. No app adopts anything in this PR,
with one stated exception: the fix of defect H12 at two import doors.

## 1. Unit families (`src/lib/units`)

### What was added

Nine families, each with an oilfield and a metric member, in both presets,
on the Units page:

| Family | Units | Oilfield | Metric | Why |
|---|---|---|---|---|
| `declineRate` | 1/d, 1/month, 1/yr, %/yr | %/yr | %/yr | DCA holds Di per day and shows it on two bases; the hub takes percent per year; Material Balance prints per year |
| `productivityIndex` | m3/d/kPa, m3/d/bar, STB/d/psi, RB/d/psi | STB/d/psi | m3/d/kPa | Well Test J; one family for a producer and an injector; RB/d/psi is the Material Balance aquifer index |
| `pseudoPressure` | kPa2/mPa.s, psi2/cP | psi2/cP | kPa2/mPa.s | Well Test gas analysis |
| `gasProductivityIndex` | 10^3 m3/d/(kPa2/mPa.s), Mscf/d/(psi2/cP) | Mscf/d/(psi2/cP) | 10^3 m3/d/(kPa2/mPa.s) | The one gas index an app prints (Well Test rate-transient results) |
| `capillaryPressure` | kPa, bar, psi | psi | kPa | SCAL Studio; a pressure difference, so never gauge or absolute |
| `interfacialTension` | mN/m, dyne/cm | dyne/cm | mN/m | SCAL Studio, Simulation builder |
| `wellboreStorage` | m3/kPa, bbl/psi | bbl/psi | m3/kPa | Well Test |
| `flowCapacity` | mD.m, mD.ft | mD.ft | mD.m | Well Test kh |
| `diameter` | mm, in, 1/64 in | in | mm | Well Test choke, Fluid Systems pipe |

Units added to families that existed (presets unchanged):

| Family | Added | Why |
|---|---|---|
| `fvfGas` | RB/scf | Fluid Systems shows Bg as rb/scf on screen and RB/Mscf in one CSV: a factor of 1000 that now has two named units |
| `liquidVolume` | MSTB, MMSTB, MMbbl, RB, 10^6 m3 | Printed by Recovery Factor, Material Balance, Waterflood, VRR |
| `gasVolume` | 10^6 m3, 10^9 m3 | Material Balance and Recovery Factor print Bcf and Bscf |
| `liquidRate` | RB/d | Reservoir-volume rates in Waterflood and Material Balance |
| `gasRate` | scf/d | Material Balance forecast |
| `gor` | Mscf/STB | Simulation results |

The spellings the apps print today (rb/scf, Bcf, Mcf, dyn/cm, STB/D/psi,
sm3/d/bar, md-ft, acres) are in `UNIT_ALIASES` (`vocabulary.js`), so
`appUnitFor` finds them.

### Factors and their sources

| Factor | Value | Source |
|---|---|---|
| year | 365.25 d | Julian year (IAU); SPE Metric Standard, yr = 3.155 76 E+07 s |
| month | 30.4375 d | one twelfth of that year |
| STB/d/psi, bbl/psi | 0.158987294928 / 6894.757293168361 m3/Pa | barrel and psi definitions; SPE Metric Standard prints 2.305 916 E-02 m3/(d.kPa) |
| RB/scf | 0.158987294928 / 0.028316846592 = 9702/1728 | barrel and cubic foot definitions |
| psi2/cP | 6894.757293168361^2 / 0.001 Pa/s | psi definition; 1 cP = 1 mPa.s |
| dyne/cm | 1e-5 N / 1e-2 m = 1 mN/m | CGS definition |
| mD.ft | 9.869233e-16 x 0.3048 m3 | darcy (API RP 40) and foot; SPE prints 3.008 142 E-04 um2.m |
| in, 1/64 in | 0.0254 m, 0.0254/64 m | 1959 agreement |

Gate: `src/lib/units/__tests__/reservoirFamilies.test.js` (a known value
derived from first principles or a published factor, a round trip and a
negative control per family). The every-pair round trip of
`registry.test.js` covers the new families too.

### Nominal and effective decline

The registry converts the **time basis** of a decline rate only. Nominal or
effective is a label the app supplies; the step between them is
De = 1 - exp(-Dn) over the same period, in
`src/lib/units/decline.js` (`effectiveFromNominal`, `nominalFromEffective`).
An app that shows a decline rate states both the basis and the time unit.

### How an app adopts it

1. Name the families it shows (`useProfileSystem(app, families)` for a
   project app, `useAppUnits` otherwise), as Well Test does today.
2. Keep state in one system. Convert at the door and at the display with
   `convert(family, value, from, to)`.
3. Print the unit from the registry label, never a typed string.
4. A decline rate: `convert('declineRate', Di, '1/d', '%/yr')`, with the
   word nominal or effective beside it.

### Not added, and why

| Quantity | Why not |
|---|---|
| Time (hr, d, yr) | The same in both systems; a decline rate carries its own time basis |
| API gravity, specific gravity, salinity (ppm), mole and weight percent, saturation, angle | Scales and fractions that do not change with the unit system |
| Pressure rate (psi/month), Hall integral (psi.day), semilog and square-root slopes, xf.sqrt(k) | Derived inside one app; converted from the families above when that app adopts the profile |
| Money per volume | Belongs to the economics modules |
| A gas productivity index in Mscf/d/psi | No Reservoir app prints one |

### Findings for the app rounds (not fixed here)

- **Well Test, SI view: wellbore storage is wrong by a factor of 47.5.**
  `src/utils/welltest/units.js` converts `bbl/psi` to `m3/kPa` by multiplying
  by kPa per psi where it should divide (1.096 against the correct 0.02306).
  Oilfield state and the engines are not affected; the SI display of C is.
  The registry value is the derived one. Fix in the Well Test round (the
  report kit branch owns Well Test files today).
- **A year is 365 days in the DCA, Forecast Scenario Hub and Well Spacing
  engines and 365.25 in the Material Balance forecast.** The registry uses
  365.25. An app that adopts `declineRate` either moves its engine constant
  or converts with its own year and says so; the difference is 0.07 percent.

## 2. Shared tabular-file parser (`src/lib/tabularFile.js`)

One reader for pasted or imported tables. Pure: text in, a plain object out.

### API

| Export | What it does |
|---|---|
| `parseTabular(text, options)` | The whole read. Options: `delimiter`, `decimal`, `dateOrder` ('dmy', 'mdy', or per column index), `header` (true or false), `nullTokens` |
| `detectDelimiter(text)` | Comma, semicolon, tab or white space |
| `detectDecimalMark(cells, { delimiter })` | `{ mark, certain, reason, examples }` |
| `parseNumber(value, { decimal })` | One number, or NaN. A misplaced group separator is refused |
| `detectDateOrder(values)`, `parseDate(value, { order })` | Day first or month first; one date or date-time |
| `headerUnit(header)` | "Pressure (psia)" to name and unit |
| `splitRows`, `isNullToken`, `columnValues`, `questionText`, `looksLikeDate` | Helpers |

`parseTabular` returns `delimiter`, `header`, `unitsRow`, `columns` (name,
unit, kind, counts, date order), `decimal`, `rows` (source line, raw cells,
typed values), `report` (`skipped` with the reason, `padded`, `unreadable`),
`questions` and `needsAnswer`.

### Rules

- **Delimiter**: the candidate that gives a steady field count. Tab wins
  over semicolon, semicolon over comma, because a semicolon or tab file may
  carry a decimal comma in every cell.
- **Decimal mark**: one per file, from the numbers. "3000,25" and "0,250"
  can only be a decimal comma; "1,234,567" only thousands; "1,234.5" and
  "1.234,5" settle themselves. When every marked number looks like "1,234"
  the file cannot settle it: the result is flagged (`certain: false`), read
  as a decimal comma in a semicolon file and as thousands elsewhere, and a
  `decimalMark` question is returned.
- **Dates**: ISO dates and date-times, year-first, month names, and numeric
  day/month/year. When no value in a column settles the order the column is
  not read: a `dateOrder` question is returned and the caller reads again
  with the answer. Nothing is guessed.
- **Rows**: text above the table, a repeated header, a totals row, a comment
  line, an empty row and a row with too many fields are left out and listed
  with the line number and the reason; a short row is padded and listed.

### The hostile file set (`src/lib/__tests__/tabularFile.test.js`)

Semicolon columns with decimal commas; tab columns with thousands
separators; mixed blanks and null words; day-first dates; dates no value
settles; a header with units in three bracket styles; a title above the
table and a totals row; BOM, CRLF and quoted fields with a delimiter, a
doubled quote and a line break inside; white-space columns; ragged rows (a
short row, a long row, a repeated header, a comment); quoted decimal commas
in a comma file; numbers that could be thousands or three decimals; ISO
date-times with an offset and a units row; spaces and apostrophes as group
separators.

### Adopted at two doors (defect H12)

| Door | Before | Now |
|---|---|---|
| Well Test gauge import, `src/utils/welltest/gaugeImport.js` (`num`) | Every comma stripped: 250,75 bar read as 25075 | The file's decimal mark; the delimiter from the shared reader; `table.decimal` says whether the file settled it. Public API unchanged |
| Material Balance data hub, `src/components/reservoirbalance/DataHub.jsx` | Every comma stripped; `parseFloat` read "2900 psia" as 2900 | The file's decimal mark and delimiter; a value that is not a number is counted in a warning; an unsettled mark is a warning. `readProductionCsv(text)` is the testable path |

Failing-first tests: `gaugeImportDecimal.test.js`,
`dataHubDecimal.test.jsx`.

### How an app adopts it

Replace the app's own CSV reading with `parseTabular(text)`. Map columns from
`columns[i].name` and `unit`. When `needsAnswer` is true, show
`questionText(q)` for each question and read again with the answer in
`options`. Show `report.skipped` and `report.unreadable` at the import door.
Order of adoption, from the plan: DCA, Waterflood, VRR, SCAL, Simulation,
then the rest of Well Test and Material Balance.

## 3. Record sharing for the Reservoir project tables

Migration file `supabase/migrations/20261002130000_reservoir_record_sharing.sql`,
**not applied**. Everything about it (the live state found, what it does,
the storage lesson, the proof and the owner command) is in
`docs/scope/OrgSharing-DESIGN-AND-STATUS.md`, section 11, and in
`MIGRATIONS.md`.

In the app the ten tables are registered in
`src/lib/recordSharing/rules.js`; the store and the share bar are generic.

### How an app adopts it

As the Geoscience apps did (section 5 of the sharing doc): the project
picker lists own records, then "Shared with me"; the app mounts
`useRecordSharing(table, row)` and the share bar; a save sends the version
it was made from; a refused save offers Save a copy. Until the migration is
applied the bar shows its "not switched on" note and saving works as before.

## 4. Not in this PR

- The share bar, the unit profile and the parser in each app: their rounds.
- New tables for Risked Reserves, EOR Screening and Well Spacing; the `rb_*`
  backfill and `.pld` family (plan owner questions 3 to 5).
- The plan's progress table and the gap matrix row H12 are not edited here,
  to keep clear of the two branches that are editing them.
