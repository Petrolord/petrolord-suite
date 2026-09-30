# Seismolord: comprehensive upgrade

App #5 of the Geoscience upgrade programme (`docs/scope/AppUpgrade-Geoscience-PLAN.md`).
Step 1 (practitioner lens, `docs/scope/AppUpgrade-BestPractices.md`) run and
fixed 2026-09-30 on branch `feat/seis-u1`. This is Seismolord's first full
practitioner audit (it never had a T1 senior test). Step 2 (advancement
review) is analysis only; batches are chosen before anything is built.

Route `/dashboard/apps/geoscience/seismolord` (ProtectedAppRoute), help
`/dashboard/apps/geoscience/seismolord/help`, harnesses `/dev/seismolord-*`
(in-memory or auth-free). The upgrade e2e drives `/dev/seismolord-workspace`:
its import dialog runs the real scan worker, and View it now opens a file
locally through the real slice worker, so the SEG-Y door and the viewer are
exercised end to end without Supabase.

Carried forward from apps #1 to #4: the section kit's TWT reference and
Seismolord horizons in the section (WC-U2-003) were checked from this side
and found broken for real Seismolord output (SEIS-U1-008); fault cuts
(WC-U2-011) and a seismic backdrop (WC-U2-017) were deferred to this app and
are in the Step 2 backlog.

## Evidence kit made for this app

| Kit | Where | What it holds |
|---|---|---|
| Hostile SEG-Y (PL2, PL3) | `e2e/fixtures/seis/hostile/segyWriter.mjs`, `generate.mjs`, 14 `.sgy` files (352 KB) | Rev 0 IBM with EBCDIC header and inline/crossline at bytes 9/21; a clean rev 1 control; rev 1 with two extended textual headers; a rev 2 little-endian file; format 3 (int16); binary sample interval 0; binary sample count 30 against 40 in the traces; an irregular outline (12 of 48 bins without traces); crossline-sorted; no coordinates; US state-plane feet with scalar 0; coordinates in decimal degrees (byte 89 = 3); a PSDM depth cube with a lying-or-not "DEPTH" header; a 2D line with CDP at byte 21. One writer feeds jest (in memory) and the browser (committed files). |
| Hostile interpretation files (PL2) | `__tests__/upgradeU1Chain.test.js` | Picks in seconds (OpendTect/Kingdom style), a depth grid in metres, TWT grids of either sign. The engines' 47 import gates with real OpendTect CC0 files (engines #236) cover dialect breadth. |
| Saved state (PL5) | `e2e/fixtures/seis/saved/` | Manifests: pre-versioning (July 2026, corners only), v1 with affine and manifest velocity (2026-07-11), 16-bit storage (W4.4), v2 attribute (W2.1), a newer build's v5. Sessions: W1.2b (2026-08-20), tester programme (2026-09-22, player, projection, AGC, wiggle, an unknown key), a deleted volume, a newer build's. |
| Chain (PL9) | `__tests__/upgradeU1Chain.test.js` | The real gridder publishes a TWT horizon; the real Well Correlation `horizonAtWell`, Mapping `gridInUnit` + `twtGridToElevation` and Seismolord `loadSurfaceMapLayer` read it back, for new and legacy rows. |
| Door and import (PL2, PL4) | `__tests__/upgradeU1Door.test.js` | Every hostile file through the door; the irregular and crossline-sorted files through the real import job manager, v4 conversion and upload into a mock store, read back through the real slice worker and compared slice by slice with the local-file read. |
| Scale (PL10) | `__tests__/upgradeU1Scale.test.js` (`SEIS_BENCH=1`) | A generated 4,502,994,000-byte virtual SEG-Y of the Claredon shape (710 x 876 x 1,750, IEEE), no disk. |
| Browser (PL2, PL6, PL7) | `e2e/seismolord-upgrade.spec.js` | The hostile set through the real dialog; the irregular file viewed locally at 1366x768 and 1440x900 in light and dark; the section PNG downloaded and read back. |

## Step 1: the twelve checks

| Check | Result | Findings | Notes |
|---|---|---|---|
| PL1 Labels mean the textbook | Failed, fixed | 011, 013, 008 | Quantity table below. Depth read "TVD" in the section and 3D readouts and "TVDSS" in the status bar for the same number; the plot and PNG named the lattice index as the line ("inline 12" for inline 1012). |
| PL2 Hostile file set | Failed, fixed; two open | 001, 002, 003, 004, 006, 007, 010, 019, 020 | 14 SEG-Y files and the interpretation cases. Before: extended textual headers were read as trace 1 (garbage geometry); a lying sample count gave 53 traces of garbage blamed on the byte positions; an unset interval imported as 0 ms silently; an irregular outline and a crossline-sorted file could not be imported at all ("check the byte positions"); a little-endian file said "format code 1280"; picks in seconds landed at the top of the volume. Integer formats and little-endian are refused with the reason (open: support them, Step 2). |
| PL3 Units, datums and frames | Failed, fixed | 005, 009, 006, 011 | A depth grid could only be imported as feet (metre grids went in 3.28x shallow downstream). A depth-migrated cube imported as time. Coordinates in degrees and all-zero coordinates were silent. Well ties in the survey CRS pass (CRS programme guards, `wellDisplay` tests). |
| PL4 No claim without the event | Failed, fixed | 003, 015, 018 | Owner rule "confirm the headers and stop if they disagree" now holds at the door; a session pointing at a deleted volume rewrote the layout before failing; the index pass reported as conversion. WellDrawBadge reasons (tester programme) hold. |
| PL5 Real saved state | Pass after fix | 015 | Every release's manifest opens; a newer build's is refused by name; sessions from W1.2b and the tester programme restore known keys, clamp to the volume and drop unknown keys (`upgradeU1Saved.test.js`). |
| PL6 Real browser | Failed, fixed; one closed by decision | 014, 026 | 1366x768 and 1440x900, light and dark: no page scroll, the seismic canvas stays dark (owner rule), TWT increases downward (axis ticks 0 at the top, e2e screenshot). View it now showed real amplitudes saturated (clip 3 on data in the thousands: 36 % of the section pure red or blue). 390 wide pans inside the workspace (known limit, desktop-first decision). |
| PL7 Report a reviewer can sign | Failed, fixed | 013 | The section and map PNGs had no caption; the plot title block lacked the vertical domain and datum, polarity and display, and the build. PNG read back in the e2e (caption band, file named `seismolord-inline-1005.png`). |
| PL8 Practitioner's day | Gaps recorded | 021 to 025 | Three persona walks below. |
| PL9 The chain | Failed, fixed; two open | 008, 021, 022 | S1: Seismolord published TWT surfaces negative, so Well Correlation could not place any Seismolord time horizon at a well ("outside the checkshots") and Mapping's time-to-depth mirrored it above sea level. Open: Pore Pressure and Mapping take linear velocity models only (layer cakes dropped); fault sticks and polygons do not reach Earth Modeling (EM-T1-010). `.pld`: the seismic family (volumes, horizons, faults, lines, picks, sessions) is registered; portability suites green. |
| PL10 Real scale | Pass | none | Generated 4.5 GB-equivalent survey: the door costs 1 ms and a clean file reads through the original reader untouched (preview scan 390 ms before, 493 ms after, within run-to-run noise at load 3.5); the new lattice pass for an irregular outline of that size (33,086 empty bins) takes 2.9 s of CPU and 2.4 MB, plus one read of the file on a real disk. Large-survey viewer targets from the tester programme (#587 to #589) unchanged. |
| PL11 Inputs a person can type | Failed, fixed | 012 | Byte-position boxes rescanned on every keystroke (typing 189 scanned at bytes 1 and 18 first; each scan of the 4.5 GB file is minutes) and clearing one scanned at byte 0 (a raw DataView range error). |
| PL12 House standards | Failed, fixed | 016, 017 | ProtectedAppRoute holds; `EMPTY_VALUE` in the new caption and import panel. Eleven tooltips and messages carried em dashes (guard test added). The help guide said time surfaces stay positive while the app published them negative, and did not describe the header checks. |

### PL1 quantity and vocabulary table

| On screen | Standard meaning | What the code does | Same? |
|---|---|---|---|
| Inline, crossline | Survey line numbers from the trace headers (SEG-Y rev 1 bytes 189/193 by convention, user-mappable) | Measured from the headers, step-aware | Yes on axes and readouts; the plot View row and PNG file name used the lattice index (011, fixed) |
| TWT (ms) | Two-way time below the seismic reference datum | `index x dt_us / 1000` | Yes; the interval now comes from the trace headers when the binary header leaves it unset (003) |
| Depth | Depth below the seismic datum through the velocity model; with the datum at sea level this is TVDSS | Velocity model V0 + kZ or layer cake, per column | Value yes; the label said TVD in the section and 3D and TVDSS in the status bar, always metres in the viewport (011, fixed: TVDSS in the display unit everywhere) |
| SEG normal polarity | Zero-phase: an increase in acoustic impedance is a peak (positive) (Sheriff; SEG 1975 for minimum phase) | Synthetics default to it; the section's polarity switch flips the display only | Yes; the caption says "polarity as recorded in the file" or "reversed on display", since the file's own convention is not known |
| Amplitude | Stored float32 as recorded; gain, AGC, clip display only | Shader-only display math (`shaderChunks.js`) | Yes; the caption now states gain, clip and AGC so a picture is not read as raw amplitude |
| RMS clip | Clip at N x RMS of the survey | `manifest.stats.rms x N`; 1 x N for a local file (014, fixed: first section's RMS) | Fixed |
| Velocity V0 + kZ | Instantaneous velocity linear in depth (a velocity function, not interval or RMS) | `velocityModel.js`, RK4-validated analytic form | Yes; the editor says "V(z) = V0 + k z". Interval (layer cake) velocities per layer; no RMS or stacking velocity input (Step 2 U2-006) |
| Horizon, surface | A horizon is the interpretation (picks on the seismic lattice); a surface is a gridded map object | `seismic_horizons` vs `geo_surfaces`, Make surface converts | Yes |
| Fault stick, fault polygon | Picks on one section; the horizon-fault intersection outline | Sticks, lofted surface, heave polygons (W3.1) | Yes |
| TWT surface in the registry | Positive TWT ms (owner rule MS0, 2026-09-05) | Was negative (the export-file sign) | Fixed (008) |
| Time or depth volume | The vertical axis of the migrated volume | Always read as time | Declared at the door; depth refused with the reason (005) |

### Findings

Severity: S1 wrong answer with no warning at scale; S2 wrong or lost data, or a door that misleads; S3 workflow gap or misleading text; S4 polish.

| ID | Sev | Check | Finding | Evidence | Status |
|---|---|---|---|---|---|
| SEIS-U1-001 | S2 | PL2 | SEG-Y rev 1/2 extended textual headers (binary bytes 3505-3506) were ignored: the first extended header was read as trace 1, inline range 1,001 to 1,077,952,576, "check the byte positions". | `upgradeU1Door.test.js` negative control; e2e PL2. | Fixed: `lib/segyDoor.js` skips them through a remapping reader in every worker (scan, v1 ingest, v4 conversion, local view, 2D). A stale word with traces at 3601 is detected by content and ignored with a note. |
| SEIS-U1-002 | S2 | PL2, PL4 | A survey with an irregular outline (traces absent from the file) or a crossline-sorted file could not be imported: the conversion refused both, blaming the byte positions, although the local viewer already indexed such files. Real 3D surveys rarely fill a rectangle. | Negative control; e2e. | Fixed: `conversionGrid` builds a trace lattice (one header pass) and the manifest takes the lattice's geometry; the dialog says how many bins are empty and that they import as nulls. Proven by the real job manager, v4 conversion and slice worker, slice by slice against the file. The older 16-bit path refuses such files with the reason. |
| SEIS-U1-003 | S2 | PL2, PL4 | Owner rule not enforced: binary and trace headers disagreeing on samples per trace gave 53 traces of garbage geometry; an unset binary interval imported silently as 0 ms (every time on the axis 0). | Negative controls. | Fixed: a disagreement stops the import naming both values and which fits the file size; an unset value is taken from the trace headers with a warning; none at all is refused. |
| SEIS-U1-004 | S3 | PL2 | A little-endian (rev 2 byte-swapped) file said "Unsupported format code 1280"; integer formats said only "format code 3" (with an em dash). | Negative control. | Fixed as a refusal with the reason and the way out; support is open (019, 020). |
| SEIS-U1-005 | S2 | PL3, PL1 | A depth-migrated volume imported as time: a 5 m sample interval read as 5 ms and horizons picked on it would be depth converted again. | `depth_psdm.sgy`. | Fixed as a declaration: "Vertical axis of this file" (Two-way time or Depth), prefilled Depth when the textual header says DEPTH or PSDM (a hint, never a decision); Depth is refused with the reason. Depth volumes are Step 2 (U2-004). |
| SEIS-U1-006 | S3 | PL3 | All-zero coordinates and coordinates in decimal degrees (byte 89 = 3) were silent; the dialog labelled byte 89 = 3 "unstated". | Negative control. | Fixed: both named with the way out (Local, or a geographic CRS). |
| SEIS-U1-007 | S4 | PL2 | A 2D line in the 3D door imported as a 1-inline "volume". | `line2d_cdp21.sgy`. | Fixed: pointed at the 2D Lines import. |
| SEIS-U1-008 | S1 | PL9, PL1 | Seismolord published TWT surfaces to `geo_surfaces` NEGATIVE (the export-file sign) against the registry rule and its own help guide. Well Correlation's TWT horizons (WC-U2-003) answered "outside the checkshots" at every well; Mapping's time-to-depth converted a Seismolord horizon to positive elevation (above sea level). The harnesses of both apps seeded positive TWT labelled as Seismolord's, so their tests passed. | `upgradeU1Chain.test.js`, negative control on origin: 6 of 10 fail. | Fixed at the source and the readers: the registry receives positive TWT (`provenance.z_sign`); Seismolord, Mapping (`gridInUnit`) and the section kit (`horizons.js`) read time rows through `surfaceTimeToPositiveMs`, so rows published before the fix read the same. Files keep negative TWT (Petrel). |
| SEIS-U1-009 | S1 | PL3, PL2 | A depth grid could be imported only as "Depth (ft)": a metre grid went into the registry labelled feet and reached Mapping, Earth Modeling and ReservoirCalc Pro 3.28x shallow, with no warning. | Negative control. | Fixed: Z domain and unit at the door (TWT ms or s, depth m or ft); the unit is stored. |
| SEIS-U1-010 | S2 | PL2, PL3 | Horizon and fault files in seconds landed at the top of the volume ("picks placed"). | Negative control (sample 0.35). | Fixed: TWT unit detected (every live z within 20), shown and overridable; provenance records it. |
| SEIS-U1-011 | S3 | PL1, PL3 | Depth readouts and the right-edge axis said "TVD" in metres whatever the display unit, the status bar "TVDSS"; plot and PNG named the lattice index as the line. | Code read; caption test. | Fixed. |
| SEIS-U1-012 | S3 | PL11 | Byte-position boxes rescanned per keystroke and crashed on a cleared box (byte 0). | e2e. | Fixed: commit on Enter or blur, 1 to 237. |
| SEIS-U1-013 | S3 | PL7 | Section and map PNGs had no caption; the plot title block lacked vertical domain and datum, polarity and display, build. | e2e PNG read back. | Fixed: caption band (survey, line number, vertical domain and datum with the velocity model in depth, polarity and display, CRS, date, build); plot rows Vertical, Display, Build, Latin-1 safe. |
| SEIS-U1-014 | S3 | PL6 | View it now scaled real data at 1 x 3 (no survey statistics): saturated sections on first look at a customer's file. | e2e negative control (36 % saturated). | Fixed. |
| SEIS-U1-015 | S4 | PL4, PL5 | A session pointing at a deleted or unshared volume rewrote layout and display, then failed. | Saved fixture. | Fixed: refused before anything changes. |
| SEIS-U1-016 | S4 | PL12 | Eleven em dashes in tooltips and messages. | Guard test. | Fixed. |
| SEIS-U1-017 | S3 | PL12 | Help guide contradicted the app on the TWT sign and did not describe the header checks. | Guide read. | Fixed. |
| SEIS-U1-018 | S4 | PL4 | The lattice pass reported as conversion 0-100 %, then conversion restarted at 0 %. | Test. | Fixed: "indexing trace headers". |
| SEIS-U1-019 | S3 | PL2 | Integer sample formats (2, 3, 8) and 8-byte IEEE are refused. Older processing deliverables are often int16. | Door. | Open: Step 2 U2-009 (engines `decodeSamples`, validation-first). |
| SEIS-U1-020 | S4 | PL2 | Little-endian SEG-Y is refused. | Door. | Open: Step 2 U2-009 (a byte-swapping reader). |
| SEIS-U1-021 | S3 | PL9 | Pore Pressure reads only linear velocity models from Seismolord and Mapping's time-to-depth refuses layer cakes, so a well-calibrated layer cake reaches neither. | Code read (`PorePressure registryBackend`, `timeDepth.usableModel`). | Open: Step 2 U2-006. |
| SEIS-U1-022 | S3 | PL9 | Fault sticks, surfaces and polygons do not reach Earth Modeling (EM-T1-010). | Code read (no reader of `seismic_faults` outside Seismolord). | Open: Step 2 U2-003. |
| SEIS-U1-023 | S3 | PL8 | Depth-domain sections are readout only: no picking in depth. | Walk. | Open: Step 2 U2-012. |
| SEIS-U1-024 | S3 | PL8 | Projects are personal; org sharing is per volume, read-only. | Walk, Wave 4 open list. | Open: Step 2 U2-008 (RLS, second engineer). |
| SEIS-U1-025 | S3 | PL8 | 2D picks are not gridding control; line markers not on 3D sections. | Walk, Wave 5 open list. | Open: Step 2 U2-005. |
| SEIS-U1-026 | S4 | PL6 | Below 1,100 px the workspace pans inside its own scroll area. | Screenshot. | Closed by the WDM decision (desktop-first, narrow must not break; no page scroll holds). |

18 findings fixed (2 S1, 5 S2, 7 S3, 4 S4), 7 open (6 S3, 1 S4), 1 closed by decision. No S1 or S2 is open. The two S1s were both at the registry door, found by running the real consumers on real Seismolord output.

### Persona walks (PL8)

**1. Petrel or Kingdom seismic interpreter (brings the operator's SEG-Y, a Kingdom horizon export and a Petrel ZMAP depth grid).**
Imports the 3D: the scan shows the measured geometry and the header checks. *Before*, a rev 1 file with extended textual headers and an irregular outline gave nonsense ranges and could not be imported; *now* the headers are skipped with a note, 12 empty bins are named as nulls and the import runs. Declares the CRS (Minna belt prefilled when the header says so) and Two-way time. Views it at once: *before*, the local view was saturated; *now* scaled by its RMS. Imports the Kingdom horizon: *before*, its times in seconds sat on the first samples; *now* "Auto (seconds)". Imports the Petrel depth grid in metres: *before*, only "Depth (ft)"; *now* Depth (m). Picks, tracks, Tops to Horizons, Make surface, publishes the TWT map: *before*, the geologist's well section could not show it; *now* it does. Would now: pick in the depth section (U2-012), interpret a PSDM volume (U2-004), guided two-point tracking and a structure-oriented filter (U2-010, U2-011), send fault sticks to Earth Modeling (U2-003), grid with 2D picks (U2-005).

**2. Graduate geophysicist (first project, a field-tape SEG-Y and a textbook).**
Opens a file whose binary header has no interval: *before*, an axis of 0 ms; *now* 4 ms from the trace headers, said. Mistypes the inline byte: the box waits for Enter and never crashes. Reads the depth axis: TVDSS in the chosen unit everywhere, the caption says below the seismic datum through V(z) = 1800 + 0.5 z. Reverses polarity for display and saves a PNG: the picture says "polarity reversed on display". Would now: a guided well tie with a wavelet estimated from the data (U2-013), RMS or stacking velocities to build the model (U2-006), a plain-language glossary on SEG polarity in the help (U2-018).

**3. Asset manager reviewing a prospect.**
Receives the section PNG and the plot: *before*, "inline 12", no date, no polarity, no build; *now* survey, Inline 1012, TWT below datum or depth TVDSS through the named model, display, CRS, date, build. Opens the depth map in Mapping from the TWT horizon: *before* above sea level; *now* below. Would now: open the interpretation read-only from a shared project (U2-008), a prospect sheet with the seismic line, map and volumes on one page (U2-016).

## Step 2: advancement review (analysis only)

### 2a. Competitor parity

Sources (public documentation, opened 2026-09-30): Petrel seismic interpretation and domain conversion ([SLB](https://www.slb.com/products-and-services/delivering-digital-at-scale/software/petrel-subsurface-software/petrel/petrel-geophysics/petrel-seismic-interpretation), [domain conversion](https://www.slb.com/products-and-services/delivering-digital-at-scale/software/petrel-subsurface-software/petrel/petrel-geophysics/petrel-domain-conversion)), Kingdom Geophysics brochure ([S&P Global](https://cdn.ihsmarkit.com/www/pdf/0621/Kingdom-Geophysics-Brochure.pdf)), OpendTect Pro and dGB plugins ([dip-steering](https://doc.opendtect.org/6.4.0/doc/dgb_userdoc/content/dip-steering/background.htm?TocPath=3+Dip-Steering%7C_____1), [Thinned Fault Likelihood](https://doc.opendtect.org/6.6.0/doc/dgb_userdoc/content/faults_and_fractures/attributes/thinned_fault_likelihood.htm), [HorizonCube](https://doc.opendtect.org/6.6.0/doc/dgb_userdoc/content/horizoncube/horizoncube_control_center/processing/create_a_horizoncube-single_line/preparing_the_framework.htm), [Faults and Fractures](https://www.dgbes.com/blog/functionality-features-and-workflows/superior-fault-imaging-using-opendtects-faults-and-fractures-plugin), [ML workflows](https://prostore.dgbes.com/opendtect-advanced-workflows.html)), Landmark DecisionSpace ([Halliburton geophysics workflow](https://www.halliburton.com/en/software/decisionspace-365-enterprise/decisionspace-365-subsurface/geosciences-suite/geophysics-workflow)). Rows marked (snippet) rest on search results only; Petrel autotracking detail rests on training material in search results.

| Capability | Leader and how | Ours | Gap | Demo-visible |
|---|---|---|---|---|
| SEG-Y import breadth | Petrel, Kingdom: IBM/IEEE/integers, byte-swap, trace-header templates, time or depth domain | IBM/IEEE, mappable bytes, extended headers, irregular and crossline-sorted (U1), header checks; integers, LE and depth refused with reasons | partial | yes |
| Large surveys | DecisionSpace "no limit on number or size of surveys" (snippet); Petrel ZGY compressed | Bricked LOD, u8 display copy, local view before upload, 4.5 GB tested | partial (no range-read shards) | yes |
| Horizon autotracking | Petrel guided (two-point), seeded 2D/3D, waveform (snippet); Kingdom Illuminator and Seeker with confidence editing | Seeded 2D/3D, NCC tracker with confidence map, Grow, Stop at faults, Tops to Horizons framework | partial (no guided two-point, no confidence-filter repick) | yes |
| Fault interpretation | Petrel sticks and automatic fault extraction; Kingdom triangulated fault surfaces; OpendTect TFL, fault-enhancement filter | Sticks with full editing, lofted surfaces, polygons with throw, auto fault picking and a Fault likelihood volume | partial (no thinning, no fault-enhancement filter) | yes |
| Attributes | Kingdom 50+ GPU attributes; OpendTect dip-steered set | Envelope, phase, frequency, sweetness, RMS, AGC, variance, edge, dip, azimuth, chaos, curvature, spectral, RAI, co-render | partial (count, no dip-steered filtering) | yes |
| Structure-oriented filtering | OpendTect dip-steered median and fault-enhancement filters | none | missing | yes (cleaner sections) |
| Well tie and synthetics | Kingdom SynPAK; Petrel synthetic with wavelet extraction | Synthetics, stretch/squeeze, phase estimate, derived checkshots, calibration of V0/k | partial (no statistical wavelet from the data at the well) | yes |
| Velocity and depth conversion | Petrel Make velocity model + Depth convert (seismic velocities, well-calibrated); Kingdom dynamic depth conversion with uncertainty | V0 + kZ, layer cake, well-calibrated; depth sections readout-only | partial (no RMS/stack velocity input, no depth picking, no velocity cube) | yes |
| Depth-domain data | Kingdom interprets time or depth; Petrel depth volumes | refused (U1-005) | missing | yes |
| 2D seismic and misties | Kingdom and DecisionSpace integrated 2D/3D | 2D lines, crooked navigation, bulk-shift mistie solve | partial (no phase mistie UI, 2D picks not gridding control) | yes |
| Multi-user and sharing | Kingdom multi-user, multi-author database; DecisionSpace collaboration | Org read-only sharing per volume, own horizons on shared volumes | partial (no shared projects, no multi-author edit) | yes |
| Plotting | Petrel and Kingdom hardcopy with templates | True-scale PDF, captioned PNG (U1) | partial (no plot templates, no SEG-Y line export) | yes |
| AVO, pre-stack, rock physics | Kingdom AVOPAK; OpendTect | Rock Physics Studio (sister app); no gathers | missing here, partial in the Suite | no |
| HorizonCube / sequence stratigraphy | OpendTect HorizonCube, Wheeler | Flatten, stratal slices, terminations (ST5); Stratigraphy Studio | partial | yes |
| Machine learning | OpendTect ML faults and facies | Rule-based auto faults; Data AI apps separate | partial | yes |
| Shared registry, no re-import | Petrel one project | Every horizon, surface, well and top is a registry row the other apps read (now correct in time, U1-008) | ahead for a multi-app Suite | yes (our story) |

### 2b. Deferred backlog harvest

| Item | Source | Decision |
|---|---|---|
| Fault polygons in the 3D window, GeoJSON export | Wave 3 open | Still wanted (U2-007) |
| Dip estimate and dip-steered variance | Wave 2/3 open | Still wanted, with structure-oriented filtering (U2-011) |
| Tracker confidence as an accept/reject repick filter | Wave 3 open | Still wanted (U2-010) |
| Tie QC provenance stored | Wave 3 open | Still wanted, small (U2-013) |
| Depth picking; depth traverses and map | Wave 3 open, PLAN input | Still wanted (U2-012) |
| Interval velocities | PLAN input | Superseded in part (layer cake exists); RMS/stack velocity input still wanted (U2-006) |
| 2D picks as gridding control; line markers on 3D sections; phase mistie UI; dt resample; 2D import resume; sub-sample statics; standalone 2D basemap | Wave 5 open, PLAN input | Gridding control and markers still wanted (U2-005); phase mistie UI wanted, small (U2-014); the rest low (U2-017) |
| Org-shared projects | Wave 4 open, PLAN input, cross-cutting item | Still wanted, needs RLS and a second engineer (U2-008) |
| Fault sticks to Earth Modeling | PLAN input, EM-T1-010 | Still wanted, first of the chain items (U2-003) |
| Fault cuts in the section (WC-U2-011) | Deferred from Well Correlation | Still wanted (U2-015), needs a registry decision on where fault-well intersections live |
| Seismic backdrop in the section (WC-U2-017) | Deferred from Well Correlation | Still wanted (U2-002): the traverse assembly already reads along an arbitrary path |
| Cube-view co-render; overlay state in sessions | Wave 2 open | Still wanted, low (U2-017) |
| Volume thumbnails; fault version-chain UI; IndexedDB cache in workers | Wave 4 open | Thumbnails dropped (cosmetic); chain UI low; worker cache low (U2-017) |
| Range-read shards (full resolution over 10 Mbps 34 s); upload-stage timings at the tester shape | Large-survey open | Still wanted (U2-019) |
| Noisy-data fault picking; real-field validation | Tops to Horizons open | Real-field owner walk still wanted; engine work in U2-011 |
| Geographic azimuth true north (convergence) | Attributes follow-up | Low (U2-017) |
| Undo of a horizon delete restores under a new id; Grow undo keeps confidence | STATUS known gap | Low (U2-017) |
| RCP ZMAP+/CPS-3 grid-body import; packed bricks; multi-attribute batch export | Hardening follow-ups | RCP item belongs to RCP (#8); packed bricks = U2-019; batch export low |
| Integer and little-endian SEG-Y; depth volumes | New in U1 (019, 020, 005) | Still wanted (U2-009, U2-004) |

### 2c. Suite integration

**Writes:** `seismic_volumes` (+ bricks, manifests), `seismic_horizons` (+ pick and confidence blobs), `seismic_faults` (sticks, surfaces), `seismic_lines`, `seismic_line_picks`, `seismic_projects`, `seismic_sessions`, `seismic_exported_surfaces`, `geo_surfaces` (structure in time or depth, attribute maps), `geo_wells.checkshots_derived` (tie-derived), `geo_culture`. `.pld`: the seismic family carries volumes, horizons, faults, lines, picks, sessions and exported surfaces.
**Reads:** `geo_wells` (header, survey, KB, CRS, checkshots, typed tops), `geo_wells_logs` (sonic, density for synthetics), `geo_surfaces` (any app's), `geo_culture`, `geoscience_settings` (project CRS).
**Consumers:** Mapping (TWT and depth surfaces, velocity models for time-to-depth), Well Correlation and Stratigraphy (horizons at the wells, TWT), Earth Modeling and ReservoirCalc Pro (through surfaces), Pore Pressure (volume velocity models), Well Data Manager (derived checkshots), Well Design (surfaces in its 3D view).

| Finding | Kind | Detail |
|---|---|---|
| TWT surfaces negative in the registry | handoff corrupts | Fixed (U1-008). |
| Depth grids imported as feet | handoff corrupts | Fixed (U1-009). |
| Fault sticks and polygons | downstream not fed | Earth Modeling builds its framework from surfaces only (EM-T1-010). U2-003. |
| Layer-cake and calibrated velocities | handoff loses context | Pore Pressure and Mapping take V0 + kZ only. U2-006. |
| Seismic along a well section | downstream not fed | Well Correlation cannot show seismic behind the wells (WC-U2-017). U2-002. |
| Fault cuts at wells | downstream not fed | WC-U2-011. U2-015. |
| Rock Physics attributes | upstream ignored | Rock Physics Studio's impedance and fluid-substitution results do not reach the synthetics or the volume (a pre-stack/AVO path is absent). U2-020. |
| Petrophysics zones and pay | upstream ignored | Synthetics use raw logs; published PHIE/Sw zones could colour the well track on the section. Low (U2-017). |
| Project sharing | handoff loses context | A manager cannot open the interpreter's project; volume-level sharing only. U2-008. |

### Ranked backlog

Sizes: S under a day, M two to four days, L a week or more.

| Rank | ID | Item | Size | Value in one line | Batch |
|---|---|---|---|---|---|
| 1 | U2-001 | Prospect-ready picture: plot templates (section with a well, map with contours and wells), legend of horizons and faults, company and analyst fields saved per user | M | The printout a manager signs, in one click | A |
| 2 | U2-002 | Seismic backdrop along a Well Correlation section path (read-only, traverse assembly, WC-U2-017) | M | The Petrel picture in the section app | A |
| 3 | U2-003 | Fault sticks, surfaces and polygons to Earth Modeling (EM-T1-010; read-only from `seismic_faults`, no schema change) | M | Interpreted faults shape the model without re-digitising | A |
| 4 | U2-010 | Tracker confidence as an accept/reject repick filter; guided two-point tracking | M | Kingdom Seeker-style editing on a demo horizon | A |
| 5 | U2-014 | Phase and amplitude mistie UI on 2D crossings (engine pieces exist) | S | Honest 2D ties | A |
| 6 | U2-013 | Tie QC stored with the tie; statistical wavelet from the seismic at the well | M | A tie a reviewer can audit | A |
| 7 | U2-007 | Fault polygons in the 3D window and as GeoJSON | S | Faults in the 3D demo picture | A |
| 8 | U2-005 | 2D picks as gridding control; 2D line markers on 3D sections | M | Regional maps from mixed 2D/3D | B |
| 9 | U2-006 | Velocities: RMS or stacking velocity input (Dix to interval), layer cakes to Pore Pressure and Mapping | L | Defensible depth conversion across the Suite | B |
| 10 | U2-012 | Picking in the depth section; depth traverses and map | L | Interpret where the well plan lives | B |
| 11 | U2-011 | Dip estimate, dip-steered variance and a structure-oriented (dip-steered median) filter; fault thinning | L | Cleaner sections and sharper faults (OpendTect parity) | B |
| 12 | U2-009 | Integer and little-endian SEG-Y (engines, validation-first against segyio) | M | Old deliverables import | B |
| 13 | U2-004 | Depth-domain volumes (PSDM): stored domain, axes, picking in depth, no double conversion | L | Modern depth-imaged surveys | B |
| 14 | U2-015 | Fault cuts at wells into the section (WC-U2-011; registry decision) | L | Honest sections in faulted fields | C |
| 15 | U2-008 | Org-shared projects and multi-author editing (RLS, second engineer) | L | Team interpretation | C |
| 16 | U2-019 | Range-read shards for full resolution over slow links; upload timings at the tester shape | L | Level 0 in seconds over 10 Mbps | C |
| 17 | U2-016 | Prospect sheet: seismic line, map, volumes and risk on one page with ReservoirCalc Pro | M | The asset manager's page | C |
| 18 | U2-020 | Rock physics to synthetics (fluid-substituted logs) and an AVO path | L | Seismic petrophysics parity (Kingdom AVOPAK) | C |
| 19 | U2-017 | Small follow-ups: cube co-render, overlay in sessions, fault chain UI, worker IndexedDB cache, true-north azimuth, delete-undo ids, pay zones on well tracks | M | Polish | C |
| 20 | U2-018 | Help: a glossary (SEG polarity, TWT, TVDSS, interval vs RMS velocity) and a first-project walkthrough | S | Graduate onboarding | A |

Batch A (demo-visible, NAPE-safe, no schema change): U2-001, U2-002, U2-003, U2-010, U2-014, U2-013 (tie QC stays in existing jsonb), U2-007, U2-018.
Batch B: U2-005, U2-006, U2-012, U2-011, U2-009 (engines), U2-004.
Batch C: U2-015 (registry decision), U2-008 (RLS, second engineer), U2-019, U2-016, U2-020, U2-017.

### Owner questions

1. Depth volumes (U2-004): refused today with the reason. Build depth-domain support in batch B, or keep refusing until after NAPE?
2. Org-shared projects (U2-008): needs an RLS change on `seismic_projects` and a second engineer. Schedule it?
3. Fault cuts (U2-015): where should fault-well intersections live (a new `geo_*` table, or computed on the fly from `seismic_faults`)?

## Batch decision (2026-09-30)

Recorded verbatim from the programme lead, 2026-09-30:

BUILD in this order, one commit per item:
- Batch A: U2-001 prospect-ready picture (plot templates for a section with a well and a map with contours and wells, legend of horizons and faults; company and analyst fields saved per user in existing per-user settings or project payload, no schema change); U2-002 seismic backdrop along a Well Correlation section path (read-only traverse assembly, served to Well Correlation's section; WC-U2-017); U2-003 fault sticks, surfaces and polygons to Earth Modeling, read-only from seismic_faults, no schema change (EM-T1-010; coordinate the reader contract in a small shared module Earth Modeling can import); U2-010 tracker confidence as an accept/reject repick filter plus guided two-point tracking; U2-014 phase and amplitude mistie UI on 2D crossings; U2-013 tie QC stored with the tie (existing jsonb) and a statistical wavelet from the seismic at the well (validate against a published/analytic case; negative control); U2-007 fault polygons in the 3D window and as GeoJSON; U2-018 help glossary (SEG polarity, TWT, TVDSS, interval vs RMS velocity) and a first-project walkthrough.
- Batch B: U2-005 2D picks as gridding control and 2D line markers on 3D sections; U2-009 integer and little-endian SEG-Y, engines-first, validated against segyio-generated fixtures (generate them with python segyio only if already installed; otherwise hand-build byte-exact fixtures); U2-006 velocities: RMS/stacking velocity input with Dix conversion to interval (validate against a textbook worked example, negative control), layer-cake velocity models published for Pore Pressure and Mapping depth conversion.
- Batch C: U2-017 small follow-ups (cube co-render, overlay in sessions, fault chain UI, true-north azimuth, delete-undo ids, pay zones on well tracks); skip any sub-item that needs a schema change and say so.
DEFERRED (after NAPE unless time remains; record reasons): U2-004 depth-domain (PSDM) volumes (decision on owner Q1: keep refusing depth volumes with the reason until after NAPE); U2-012 picking in depth; U2-011 dip-steered filters; U2-015 fault cuts at wells (decision on owner Q3: when built, compute fault-well intersections on the fly from seismic_faults, no new table); U2-008 org-shared projects (owner Q2: needs an RLS change on seismic_projects and a second engineer, left for the owner); U2-019 range-read shards; U2-016 prospect sheet with RCP (revisit at app #8); U2-020 rock physics to synthetics / AVO (revisit at app #10).
Units note: the owner is deciding on a Suite-wide unit profile. Do not add new app-local unit preferences; where a unit choice is needed, keep using the existing account depth unit (src/lib/crs/settingsService.js getDepthUnit) and the declared units at the import door.

## Step 2 build log

Branch `feat/seis-u2`. One row per item, in build order; each row names the test that fails without the item.

| ID | Status | What was built | Proving test |
|---|---|---|---|
| U2-001 | Done | Plot templates (Current view; Section with a well; Map with contours and wells) that check the picture before plotting and say what is missing; a legend column of the horizons, faults, wells and contour interval actually drawn (SliceView and MapView report what they drew, never the explorer list); Company and Analyst in the title block, saved per user in the account metadata (`seismolord_plot_identity`, no schema change; the profile name is the default analyst). `lib/plotTemplates.js`. | `u2PlotTemplates.test.js` (line through no well refused, legend from the drawn set, hostile identity text, store round trip); `e2e/seismolord-u2.spec.js` PDF read back with pdftotext at 1366x768 and 1440x900, light and dark |
| U2-002 | Done | Seismic backdrop in Well Correlation's section (WC-U2-017): pick a Seismolord volume under "Seismic backdrop"; the volume is read along the line through the section wells in section order with the real traverse engine (one trace per bin, bricks read once), each well anchored on its own trace, and painted between the columns on a structural TWT section (logs stay on top). Flattened, stretched or depth sections say why it is hidden. Wells off the survey, without a location or in a local grid are named; fewer than two on the survey is refused. The volume choice is saved with the section (track_layout jsonb). Read only. `services/sectionBackdrop.js`, section kit `seismicBackdrop.js` and `useSeismicBackdrop.js`. | `u2Backdrop.test.js` (trace at each well bit for bit against the closed-form KETA 3D volume, Dome event at 1373 ms, reversed-order negative control, hostile wells, cap refusal); e2e U2-002 at 1366x768 light and 1440x900 dark (seismic colour between columns, none before a volume is chosen); Well Correlation and Stratigraphy suites green (41 suites) |
| U2-003 | Done | Fault sticks, surfaces and polygons to Earth Modeling (EM-T1-010), read only from `seismic_faults` (current heads) and `seismic_volumes` (survey_meta geometry, crs, velocity_model), no schema change. The contract lives in `src/lib/seismicFaultsReader.js`, which Earth Modeling imports: per fault the sticks and lofted surface in world XY with TWT (and depth only through a linear V0 + kZ model; a layer cake is named, never guessed), the trace at a TWT level (default the middle of the fault), and `hangingWallBlock`, the model frame on the side the fault dips towards, which is the closed polygon EM's block engine takes. CRS: same tag as is, transformable converted, local grids named. Earth Modeling's change is small: a "Faults from Seismolord" explorer list with Add (provenance kept in the saved definition), and the sticks drawn in its 3D view when depth is known. | `src/lib/__tests__/seismicFaultsReader.test.js` (world XY, TWT and depth to the metre, east-dipping block vs west-dipping negative control through EM's `labelBlocks`, hostile rows, CRS skips); e2e U2-003 at 1366x768 dark and 1440x900 light (Add, rebuild, 2 blocks, eastern census); Earth Modeling suites green |
| U2-010 | Done | Tracker confidence as an accept/reject repick filter and guided two-point tracking (`lib/trackerEdit.js`). Interpretation toolbox: a Confidence threshold with Reject (nulls the target horizon's scored picks below it as one undoable edit; picks without a confidence are kept and counted) and Reject + repick (grows again from the kept picks with the threshold as the correlation limit, row updated in place, undoable). Guided (2 points): the seed becomes point A, a second seed on the same line is B, and the pick is the Viterbi path of greatest waveform continuity through both, snapped and refined to sub-sample, interpolated across dead traces. | `u2TrackerEdit.test.js`: guided within 0.35 samples of a dipping event through a dead zone beside a stronger event, negative control the greedy tracker stopping at the gap; reject + repick through the real `regionGrow3D` (a noisy trace stays rejected, clean neighbours tracked from it come back above the threshold); hostile guide points refused; e2e U2-010 two points picked through the real SliceView |
| U2-014 | Done | Phase and amplitude mistie UI on 2D crossings (`lib/mistieCharacter.js`). After Analyze, the mistie dialog measures each tied crossing on the displayed sections, in a 200 ms window about each line's own pick (the time mistie removed first): the constant phase rotation from line A to line B (engines `estimatePhaseRotation`) and the amplitude ratio B/A. A per-line phase rotation and amplitude scalar is solved for the network (least squares, mean zero phase, unit geometric-mean scale) with the RMS before and after, and "Apply phase and amplitude" stores it in the line row's `survey_meta` jsonb (no schema change); `loadLineSection` applies it display side, composing with any earlier correction, stored samples untouched. A dead trace gives no measurement (named, never a zero). | `u2MistieCharacter.test.js` (a 30 degree, 1.5x analytic case recovered; identical traces negative control at zero; three lines 0/30/-20 degrees, 1/1.5/0.8: after applying the solved corrections the re-measured misties are under 1 degree and 1 %); e2e U2-014 table values in the browser |
| U2-013 | Done | Tie QC stored with the tie and a wavelet measured at the well (`lib/wellWavelet.js`). The statistical wavelet from the seismic at the well already existed (W-series, zero phase by construction); new is "Extract from the well": the damped least-squares (Wiener) wavelet that turns the well reflectivity into the seismic trace at the well, so its phase is measured. The synthetics window shows each wavelet's peak frequency and constant phase (and the well fit). Committing the tie (derived checkshots, or the calibrated velocity model) now stores a QC record in the existing provenance jsonb: mean and minimum windowed correlation, up to 200 windows, bulk shift, phase applied, anchors and the wavelet (kind, length, peak Hz, phase), shown as "Stored: Tie QC ..." when the well is reopened. No schema change. Note: a residual time shift reads as phase in a constant-phase estimate, so extract after the bulk shift. | `u2WellWavelet.test.js` analytic case: a 30 Hz Ricker peaks at 30 Hz (the Ricker spectrum property), a 40 degree rotation reads 40; the well extraction recovers the rotated wavelet (correlation above 0.999, 40 degrees) and stays above 0.95 with 20 % noise; negative control: the statistical wavelet gets the 30 Hz spectrum but reads zero phase and correlates below 0.9 with the truth; flat and short logs refused. `u2WellWaveletPanel.test.jsx` in the real SyntheticsPanel; e2e U2-013 at both viewports |
| U2-007 | Done | Fault polygons in the 3D window and as GeoJSON (`lib/faultPolygons.js`). The 3D window draws every visible fault's W3.1 cutoff polygon against every visible horizon as a closed loop whose vertices keep their own cutoff times (footwall then hanging wall), under the Faults toggle. The fault's explorer menu adds "Fault polygons (GeoJSON)": one Polygon feature per horizon it cuts, closed and counterclockwise, with fault, horizon, TWT range and mean and maximum throw; in WGS 84 longitude and latitude (RFC 7946) when the volume CRS converts, otherwise in the survey CRS with the legacy "crs" member naming it and a note. Pairs without a polygon are named. | `u2FaultPolygons.test.js` on the analytic faulted horizon of the W3.1 oracle (loop closed, cutoff times 40 and 48 samples, gap x range in metres, throw 32 ms, UTM 31N to about 3.01 E 54.14 N, negative control without a crossing); e2e U2-007: the polygon's colour appears in the 3D window's screenshot only when the polygon is on |

## Verification (Step 1)

See the PR for the final run. Jest in band: Seismolord suites, CRS, wells and surfaces registries, section kit, Mapping time-depth and surface export. Browser: `e2e/seismolord-upgrade.spec.js` and the Seismolord e2e specs against the branch dev server (port 8370), one worker. Production build after rebase.
