# Wave 1B re-checks (Senior Testing Programme, 2026-09-26)

Six apps that went through full tester programmes before Wave 1 were
re-checked at 1366 x 768 on their dev harnesses, for regressions and for the
defect classes Wave 1 found elsewhere (depth plots drawn upward, units
mixed in one panel, copy style).

| App | Result | Finding and fix |
| --- | --- | --- |
| Seismolord | Pass | Explorer empty states used em dashes ("No volumes yet — import...") | Copy fixed |
| Well Data Manager | Pass | The well row clipped its "TD ... m" tag (name span could not shrink) | `min-w-0` / `shrink-0`; tooltip copy |
| Petrophysics Studio | Pass | Tracks, zones and pay read correctly with the well loaded; empty-state copy | Copy fixed |
| Well Correlation | Pass | Section-path map clipped the easternmost well label ("KET") | Label flips left when it would run off |
| Well Design Studio | Pass | Section view TVD reads downward; the mud window chart is fixed in #640 | None here |
| Wellsite Studio | Pass | Approach sentence in metres over a panel in feet ("52 m MD above... 20 m window" beside "171 ft"); ribbon subtitle wrapped the title | Sentence restated in the display unit; subtitle only on wide screens |

The same empty-state em dash pattern was fixed in Rock Physics, ReservoirCalc
Pro and Simulation Studio strings found by the same search.
