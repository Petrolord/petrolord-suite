# Fluid Systems Studio: laboratory PVT tables (FLUID-U2-001, PL2 and RL10)

The tables of one published PVT study in several shapes, for the lab data
door (`src/utils/fluidstudio/labData.js`, on the shared typed reader
`src/lib/tabularParse.js`).

Source of every number: Good Oil Co., Oil Well No. 4, reservoir fluid study
by Core Laboratories, file RFL 88001 (pages 5, 7 and 10 of 18: pressure-volume
relations, differential vaporization and viscosity data at 220 degF), read
from the report copy in the Texas A&M P324 course archive
(blasingame.engr.tamu.edu, "Prob_02_P324_06A_Course_Work_(Ref_Good_Oil_No_4)"),
retrieved 2026-10-02. It is the study McCain and Ahmed reproduce. Pressures
are gauge. The optimum separator test of the same study (100 psig and 75 degF)
gives Bofb 1.474 RB/STB, Rsfb 768 scf/STB and a 40.7 degAPI stock-tank oil.

| File | What it is, and what is hostile about it |
|---|---|
| `good-oil-dl-twin.csv` | Differential liberation, plain: comma, units in brackets, psig. Every other DL file holds the same twelve rows |
| `good-oil-dl-si-semicolon.csv` | Semicolon separated with decimal commas; kPa absolute, m3/m3 and kg/m3 in square brackets; columns in another order; a text column; a two-language header |
| `good-oil-dl-title-tabs.txt` | Tab separated with CRLF; a title above the table; the laboratory's own column names; the units on a second header row; thousands separators in the pressure; a comment line, an empty line and two lines of text under the table |
| `good-oil-study.xlsx` | A workbook: the differential table on the first sheet under two title rows with a units row, the viscosity table on the second, a notes sheet with no table |
| `good-oil-cce-spaces.txt` | Constant composition expansion, columns separated by spaces, a dash for a value that was not measured |
| `good-oil-viscosity.csv` | Viscosity table with quoted headers that hold a comma, and an oil to gas viscosity ratio column that is no viscosity |
| `good-oil-dl-no-header.csv` | No header row: refused, with the reason |
| `not-a-lab-table.csv` | A production table: refused, with the reason |

Read by `src/components/fluidstudio/__tests__/fluidLabData.test.jsx` and
`e2e/fluid-systems-u2.spec.js`.
