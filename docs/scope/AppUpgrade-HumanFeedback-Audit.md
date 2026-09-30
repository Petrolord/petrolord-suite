# Human feedback audit (2026-09-28)

Source catalogue for `docs/scope/AppUpgrade-BestPractices.md`. Every row is a
change a human asked for or exposed. W = tester team, O = owner (E2E walk or
directive after using the app), U = user report, C = client. Excluded:
findings Claude made itself (T1 audits, Ekene demo kit, harness runs,
manual writing) and the preventive "tester readiness" series, which carried
human findings forward.

## Catalogue

| Date | App | Who | What the human said (paraphrase) | Change (PR / commit) | Category |
|---|---|---|---|---|---|
| 04-26 | DCA | U | Could not tell whether the upload worked | Loaded-file card, replace/clear (#10) | misleading status |
| 07-07 | VRR Monitor, Fractional Flow | O | Charts without the house template | Suite rule: white chartTheme + ChartLogo | chart standard |
| 07-15 | NextGen, then Suite-wide | O | "AI dashes", "X, not Y" copy | Copy rule, guard tests, 609-string sweep | copy |
| 07-31 | ReservoirCalc Pro | W | Typed net pay into the thickness field | "Gross Thickness" + NTG hint | terminology |
| 08-02 | ReservoirCalc Pro | O | Unit toggle turned 5,000 acres into 5,000 km²; Bg only rcf/scf | Per-parameter units, convert on toggle (#149) | units |
| 08-02 | ReservoirCalc Pro | U/O | Cleared field snaps to 0; New project does nothing; several reservoirs per project | NumberField; multi-reservoir; Save had never worked (#150, 7481d0366) | input typing; misleading status; persistence; workflow |
| 08-14 | ReservoirCalc Pro | W | Export text overlaps; tornado not symmetric about P50 | JS clipping for html2canvas; `tornadoSwings` (#170) | visual (export); domain |
| 08-14 | DCA | U | Fitted line vanishes; chart clipped; P10/P50/P90 one colour; jargon; Add well dead | Log-guarded series, palette roles, copy, wells dict (63acad09c) | visual; terminology; misleading status |
| 08-14 | DCA | U | Results cramped; Type Curve page will not scroll | Tabbed results, height fix (#179) | layout |
| 08-14 | Material Balance | W | CSV parsed, Run tab says "no data"; save 400 | DataHub mounted; toast reworded; ISO dates; upsert (#168) | persistence; misleading status; import |
| 08-21 | MBAL charts | O | Logo too big | Per-app `logoHeight` | chart standard |
| 08-26 | DCA | O | Watermark size; chart scattered after tab switch; no undo on delete | 40 px logo, animations off, Undo toast | visual; data safety |
| 08-28 | VRR Monitor | O | "Doesn't even import" | V1 to V3: real import, ledger, PVT | import |
| 08-28 | Well Design | O | Horizontals are not all 90° | Landing inclination resolved; override | domain |
| 08-30 | Module hubs | O | Stale copy; bullets look clickable; broken Featured link | Catalog is the only list; guard test | misleading UI |
| 09-02 | Suite/HSE login | O | Placeholder logo; invisible text; wants password eye | Theme tokens; eye toggle | visual (jsdom-blind) |
| 09-03 | Petrophysics | O staging E2E | White tracks; duplicate well names; only alias curves display | White canvases, unique names + index, `log:<MNEMONIC>` (#361) | chart standard; data integrity; import |
| 09-03 | Petrophysics / WDM | W (Petrel users, 10) | Checkshots MD + OWT; navigator; editable checkshots and tops; zones from tops; ft and MD/TVD/TVDSS exports; fills; D-N display; digitizer | PT0 to PT7 (#364 to #372) | units; workflow; domain |
| 09-03 | Well Data Manager | W | LAS 3.0 fails; no way from WDM into other apps | LAS 3.0 reader; Open-in launchers (#375) | import; cross-app |
| 09-03 | Well Design | W | 800,000 ft plan; xlsx survey; clipped station list | `targetFrame.js`, `tabularFile.js` (#373) | frames; import; visual |
| 09-03 | Well Test | W | Blank log-log; legend over axis title | Size forwarding; Playwright geometry (#374) | visual (jsdom-blind) |
| 09-05 | Petrophysics / WDM | W (PT8, 5) | Surface X/Y; drag tops; PNG; Pickett zone filter; TVD columns; cannot type "-" | #382, #434 | workflow; input typing |
| 09-07 | 11 drilling studios | W | Well Design well shows name only | Draft fallback in `trajectorySource.js` (#433) | cross-app |
| 09-07 | Casing & Tubing | W | White schematic; VE; shoe labels; unsaved work lost | `draftStore.js` (#446) | chart standard; persistence |
| 09-07 | Petrophysics | W (PT9) | k missing; PHIT vs PHIE; crossplots by zone; salinity; facies | PT9a to g (#439 to #445); PHIE was PHIT | domain correctness; defaults; workflow |
| 09-07 | Wellsite | W | Floating-rig lag needs riser + booster | Two-leg lag engine (#438) | domain |
| 09-07 | Breeze Energy | C/O | 3-month all-apps deal; bundled HSE; sponsor seats | Quarterly term fix; HSE grant; sponsor pools | entitlement; workflow |
| 09-08 | Whole Suite | W | "Failed to fetch dynamically imported module" | Stale-shell self-repair (#449) | deploy state |
| 09-08 | Hydraulics, Cementing, Well Control | W | "No hole sections" with casing present | `geometrySource.js` (#447) | cross-app |
| 09-08 | Well Test | O | Tooltip pinned top-right | `PINNED_TOOLTIP_PROPS` (#448) | chart standard |
| 09-09 | Petrophysics | W (PT10) | k and TEMP still missing; depth-density; P10/P50/P90 | Saved-state migration v2; PT10b to d (#453, #454) | persistence; defaults |
| 09-09 | Petrophysics PT10/11 | O | P-label convention; Bateman-Konen chart | `percentileConventions.js`; declared fit band | domain |
| 09-22 | Well Design | W (Lordsway, 5) | Compass plan table; vertical forced to build; kink-drawn build; offsets; Minna CRS | #570 to #574 | domain; visual; discoverability |
| 09-22 | Seismolord | W/O (6 groups) | 4.5 GB never displays; hangs; toggles; wells absent; update loop; slice player; undo; toolbox; import dialects | #575, #579 to #589 | performance; state; misleading status; workflow; import |
| 09-23 | Seismolord | O | Tie tops to horizons automatically | Tops to Horizons (#590) | workflow |
| 09-23 | Resources page | O | Remove false claims | #610 | misleading claims |
| 09-26 | Fiscal Regime | O | Default named after the real PIA | "Sample PSC" | no fake realism |
| 09-27 | Homepage | O | No prices on the public homepage | #712 | commercial copy |
| 09-28 | Design system | O | Light grey panel | Grey-panel light theme (#754) | visual standard |
| 09-28 | Well Test | W (external, 5) | CSV units and column order; pwf needs its time; "converged" without regression; PDF lacks Field/Analyst | `gaugeImport.js`, `resolveMatchMethod`, `buildReportHeader` (#810) | units; import; misleading status; report metadata |

## The ten most instructive

| # | Instance | Why automated testing missed it |
|---|---|---|
| 1 | PHIE was PHIT | Goldens pinned the code; nothing checked the label's meaning |
| 2 | k missing after the fix | Default tested on fresh state; the real saved row said `none` |
| 3 | Only definitive designs reached 11 studios | Harness seeds definitive designs; users leave drafts |
| 4 | Hole sections only written by T&D | Apps tested alone; the C&T to Hydraulics flow never ran |
| 5 | Blank log-log plots | jsdom renders every chart empty, so empty passed |
| 6 | Build drawn as a kink | Data right, chart rendered; only an engineer sees the aspect |
| 7 | "Converged" after a manual match | Tests never moved sliders after a fit |
| 8 | 4.5 GB survey | Synthetic volumes are small |
| 9 | Minna CRS "missing" | Search tests passed; nobody browses without typing |
| 10 | 800,000 ft plan | Harness wells use one local frame |

Counterpoint: after three human rounds on ReservoirCalc Pro, the T1 audit
still found a 3.28x GRV/contact unit error. Humans and T1 find different
classes; the programme needs both.
