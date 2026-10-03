# Fluid Systems Studio: composition tables (FLUID-U2-009, PL2 and RL10)

The reservoir fluid of Good Oil Co. Well No. 4 (Core Laboratories RFL 88001,
the mole percent of the hydrocarbon analysis, C7+ molecular weight 218 and
specific gravity 0.8515; the same values the engines literature fixture
holds) in several shapes, for the composition door
(`src/utils/fluidstudio/compositionImport.js`).

| File | What is hostile about it |
|---|---|
| `good-oil-twin.csv` | The plain form: mol%, MW and SG columns on the C7+ row, a total row |
| `good-oil-fraction-semicolon.csv` | Mole fractions with decimal commas, semicolons, names spelled out in another order, a two-language header, the C7+ properties as rows of their own |
| `good-oil-report-tabs.txt` | The laboratory's layout: a title, tabs, CRLF, a weight percent column beside the mole percent, hydrogen sulfide at zero, a total row, a comment |
| `heavy-end-split.csv` | Single carbon numbers C7 to C10 and no C7+ row: refused, with the reason |
| `weight-percent.csv` | Weight percent only: refused, with the reason |
