# NextGen Academy: the Quantitative Interpretation course (plan of record)

Plan for one new NextGen Academy course on QI Studio. **APPROVED by the owner
on 2026-10-11, with every decision as recommended** (D1 `welldata` only; D2
teach on Ekene v3, capstones graded on held-out synthetic cases; D3 build the
`{{video}}` block and registry now, private host chosen later with Bunny
recommended, A1 to A3 from YouTube at launch; D4 the engines move goes ahead;
D5 `qi`, Quantitative Interpretation, Geoscience, path_order 80). One change
from section 6 at approval: a members-only video with no host configured shows
a "coming soon" placeholder in the lesson instead of rendering nothing.
Migrations carry real creation-date timestamps in place of the `20261119`
placeholder below. Merge-on-green is authorised for the build; migrations are
written and applied by the owner.

Written 2026-10-11. Authority once approved: this document, for the QI
course only. Standing rules come from NextGen-Academy-PLAN.md (doctrine),
NextGen-Remaining-Courses-PLAN.md section 11 (per-wave shape) and the wave
kit at `/root/dc-wavekit` (bank and leak gates).

Heads read for this plan:

| repo | head | what was read |
|---|---|---|
| petrolord-suite | `eb5338ddf` (origin/main) | `src/pages/apps/QIStudio/**`, `worker/seismic-worker`, `tools/demo-dataset`, `tools/demo-video/storyboards/lessons/QI-LESSON-PLAN.md`, QI-PLAN.md, QI-STATUS.md |
| petrolord-engines | `cc4c62d` (origin/main) | `engines/qi/*`, `engines/rockphysics/*`, `test-data/qi`, `test-data/rockphysics`, `tools/validation/qi`, `tools/validation/rockphysics`, `__tests__/qi.*` |
| petrolord-nextgen | `d165a0af3` (origin/main) | the Marine course PR #280 end to end (the most recent App course), Rock Physics and Seismic Interpretation course trees, `courseContent.js`, `panelRegistry.js`, `packages/engines/VENDOR.json`, migrations |
| NextGen live DB | read-only SELECTs, 2026-10-11 | `academy_apps` (79 rows, all `available`), 237 active tier structures, 31,585 questions, 234 capstones; capstones of `rockphysics`, `seismolord`, `facies` |

## 1. Course identity

| field | value | why |
|---|---|---|
| slug | `qi` | Academy slugs are one lowercase word (`rockphysics`, `seismolord`, `earthmodel`); the route becomes `/dashboard/apps/qi` and the panel prefix `qi-`. No collision in the live catalogue. |
| name | Quantitative Interpretation | The discipline name; the learning page names the Suite app, QI Studio. |
| module | `geoscience` | QI Studio's Suite tile (`qi-studio`) sits in the Geoscience module. The academy key and the Suite module slug agree for geoscience, so `suite_module` stays NULL and the Expert bridge code discounts the Geoscience module (see `20261117_bridge_suite_module.sql`). |
| path_order | 80 | The live maximum is 79 (`contracts`). The sidebar sorts by `path_order` inside a module (`CourseModuleNav.jsx`), so 80 lists QI last in Geoscience, after Basin & Charge. That is the right place in the daily loop: QI consumes Rock Physics, Seismic Interpretation and Mapping. There is no unique constraint on `path_order`, and renumbering 70 rows to put it at 11 buys nothing. |
| school | `subsurface` (default) | Fees at the published Subsurface & Engineering level (Associate, Professional, Expert as for every geoscience course). |
| course_type | `app` | One app, one course; the practicals run in the course's own panels over the vendored engines, and the learning page points to QI Studio. |
| prereq_slug | `welldata` | Doctrine: only Well Data Management hard-gates the other geoscience courses, every other link is recommended. Every live geoscience row carries `welldata`. See decision D1. |
| recommended before | Rock Physics (Professional and Expert), Seismic Interpretation (Associate) | Stated on the course page and in the Associate M01 lessons; enforced by nothing. |

The Rock Physics course already teaches Batzle-Wang fluids, Gassmann,
Greenberg-Castagna, Shuey, the Rutherford-Williams classes, exact Zoeppritz
and wedge tuning (live capstones UQUO, three tiers). Seismic Interpretation
already grades synthetics, a bulk shift and tuning on `basic_20`. The QI
course does not re-teach or re-grade any of those. Where QI needs them it
recaps in one lesson and links back, and its banks and capstones are swept
against both courses for cross-course leakage (section 4).

## 2. Tier, module and lesson outline

Shape as every course since DR8: three tiers, six modules a tier, 26 lessons
a tier (module sizes 4 or 5), 78 lessons in all. Each tier ends on a
capstone brief lesson. Lesson keys follow the `mNN-<slug>/lNN-<slug>.md`
pattern; the titles below are working titles.

The QI Studio workflow has three stages, and the tiers follow them:

- **Associate: feasibility.** Is the data good enough, and can the seismic
  see the fluid? (QI Studio Overview, Inventory, QC and Feasibility tabs;
  Rock Physics Studio elastic logs, substitution and crossplots.)
- **Professional: from the tie to AVO on the seismic.** (QI Studio Well
  ties, Prestack, AVO and AVO at the wells tabs; Seismolord synthetics.)
- **Expert: inversion, properties and the decision.** (QI Studio Inversion,
  Simultaneous, Properties, Prospects and Report tabs.)

### Associate (beginner): feasibility

| module | lessons | video |
|---|---|---|
| M01 What a QI study asks | l01 why a QI study, l02 the Ekene field and the teaching pack, l03 the two questions, l04 times, polarity and impedance units, l05 the panels and their refusals | A1 (public) on l01 |
| M02 The data inventory | l01 what a QI study needs from each well, l02 the usability matrix, l03 limited and missing (Ekene-9 has no density), l04 the issue register | A2 (public) on l02 |
| M03 Seismic QC | l01 the amplitude spectrum, l02 the -6 dB band and the centroid, l03 signal to noise from trace coherency, l04 acquisition footprint and where to measure it | A3 (public) on l01 |
| M04 Elastic logs at the wells | l01 what Rock Physics hands to QI (recap and link), l02 measured shear against Greenberg-Castagna, l03 the local shear trend and its prediction interval, l04 the elastic set (AI, SI, Vp/Vs, lambda-rho, mu-rho) | B4 on l03 |
| M05 Will the fluid show? | l01 the fluids at Ekene conditions (recap), l02 oil-to-brine substitution on a log, l03 how far impedance and Vp/Vs move, l04 the wet trend on a crossplot, l05 distance from the wet trend | B5 on l02, B6 on l04 |
| M06 The feasibility verdict | l01 modelled AVO at the zone top, l02 in situ against brine, l03 writing the verdict, l04 the capstone brief | B7 on l01 |

### Professional (intermediate): from the tie to AVO on the seismic

| module | lessons | video |
|---|---|---|
| M01 What this tier adds | l01 what this tier adds, l02 the synthetic in one lesson (recap and link to Seismic Interpretation), l03 statistical and well wavelets, l04 phase and correlation | C8 on l03 |
| M02 The tie and the field wavelet | l01 bulk shift and anchors, l02 the time-depth record every app reads, l03 comparing wavelets across wells, l04 aligning and averaging into one field wavelet, l05 when one well disagrees | C9 on l01, C10 on l04 |
| M03 Gathers and their QC | l01 offset gathers and bin width, l02 NMO stretch and the stretch mute, l03 residual moveout, l04 fold and what it limits | D11 on l01 |
| M04 Angles from velocity | l01 RMS to interval velocity (Dix), l02 Walden's straight-ray angle, l03 angle gathers and ranges, l04 partial stacks and the usable angle | D12 on l02 |
| M05 AVO volumes | l01 the Shuey fit from near, mid and far, l02 intercept and gradient volumes, l03 the background trend and the off-trend distance, l04 the fluid factor and the chi projection, l05 conditioning before AVO (trim statics, stack matching) | E13 on l02 |
| M06 AVO at the wells | l01 one scale over every well, l02 class agreement and misfit, l03 what a disagreement means, l04 the capstone brief | E14 on l01 |

### Expert (advanced): inversion, properties and the decision

| module | lessons | video |
|---|---|---|
| M01 The forward model | l01 what this tier adds, l02 the convolutional model and its adjoint, l03 the low-frequency model from wells and horizons, l04 the wavelet scale | (F15 intro) |
| M02 Post-stack inversion | l01 model-based least squares, l02 blocky and sparse-spike, l03 coloured inversion, l04 blind wells, l05 sensitivity as Q10, Q50 and Q90 | F15 on l01 |
| M03 Simultaneous inversion | l01 Fatti's three parameters, l02 angle-dependent wavelets, l03 why density needs the far angles, l04 blind wells per parameter | F16 on l01 |
| M04 Properties from impedance | l01 a linear transform and its interval, l02 left-out wells and the widened band, l03 Bayesian facies on impedance, l04 two attributes (AI and Vp/Vs), l05 the confusion matrix and a fluid hypothesis | F17 on l02 |
| M05 Prospects | l01 crest, spill and closure, l02 anomaly conformance and the implied contact, l03 independent evidence and competing explanations, l04 the QI assessment | F18 on l04 |
| M06 The report and the limits | l01 the QI report and the handover files, l02 what QI never sets (the geological chance), l03 what the engines do not compute, l04 the top of the ladder | (F18 end) |

Counts: Associate 26, Professional 26, Expert 26; 78 lessons. All 18
videos are placed: A1 to A3 and B4 to B7 in Associate, C8 to E14 in
Professional, F15 to F18 in Expert. Module A is public on YouTube; B4 to
F18 (15 videos) are members-only enrichment (section 6).

### Panels

Four panels over one teaching lab (`src/components/course/panels/qi/qiLab.js`),
every exported value pinned by tests, in the Marine pattern (visible control
for every required input, start selectors, graded-answer guard, readable and
stated-controls suites):

| panel id | tier | what it runs |
|---|---|---|
| `qi-feasibility-explorer` | Associate | seismic QC spectrum and S/N on a trace set; local shear trend; substitution; wet trend and distance |
| `qi-prestack-explorer` | Professional | wavelet comparison and averaging; NMO stretch; Dix and Walden; angle gather, partial stacks, usable angle; Shuey fit; AVO at the wells |
| `qi-inversion-explorer` | Expert | LFM, model-based and simultaneous inversion on traces at the wells, blind-well table, spread |
| `qi-prospect-explorer` | Expert | property transform and interval, facies posterior, closure and anomaly conformance on a small grid |

Everything runs in the browser on small arrays (a few hundred samples a
trace, at most a dozen traces or CDPs, a grid of a few thousand nodes). The
volume jobs stay in QI Studio and on the worker; the course never needs the
worker.

## 3. The extraction gate for QI

The rule: an engine lands in petrolord-engines with goldens and an
independent oracle before a lesson is written, and every capstone field is
a return value of such an engine. Today's state, module by module
(engines `cc4c62d`):

### Open today (golden plus independent oracle)

| module | golden | oracle | what it can grade |
|---|---|---|---|
| `qi/inversion.js` | `goldens.inversion.json` | `oracle_inversion.py` (pylops PoststackLinearModelling, regularised LSQ, FISTA) | forward model, `modelBased`, `fistaReflectivity`, `lowFrequencyModel` |
| `qi/inversionSpread.js` | `goldens.inversionSpread.json` | `oracle_inversion_spread.py` | quantiles across realisations, relative spread |
| `qi/prestackInversion.js` | `goldens.prestackInversion.json` | `oracle_prestack_inversion.py` | Fatti coefficients, `simultaneousInversion` (full and near-only) |
| `qi/propertyPrediction.js` | `goldens.propertyPrediction.json` | `oracle_property_prediction.py` | linear transform and its interval, Gaussian and KDE facies models, posterior, confusion matrix |
| `qi/seismicQc.js` (part) | `goldens.seismicQc.json` | `oracle_seismic_qc.py` | analytic Ricker spectrum: peak, -6 and -20 dB edges, centroid |
| `rockphysics/fluids.js`, `gassmann.js`, `vsEstimate.js`, `avo.js`, `wedge.js` | `goldens.json`, `goldens.u2.json` | `oracle.py`, `oracle_u2.py` (bruges, open_petro_elastic, rockphypy cross-checks) | Batzle-Wang, Gassmann, Greenberg-Castagna, iterative Vs, exact Zoeppritz, Shuey, fluid line |
| `rockphysics/elasticSet.js`, `granular.js`, `inclusion.js`, `avoTrend.js` | `goldens.elastic.json`, `goldens.granular.json`, `goldens.inclusion.json` | `oracle_elastic.py`, `oracle_granular.py`, `oracle_inclusion.py` | elastic set, local shear regression with interval, rock models, wet trend and distance |
| `lib/gridding/closure.js` | `test-data/mapping/goldens/closure_cases.json` | `tools/validation/mapping/oracle_closure.py` | crest, spill, closure area and GRV |

### Closed today (tests use designed truths in jest, no independent oracle)

| gap | module | today | needed for |
|---|---|---|---|
| G1 | `qi/prestack.js` (Dix, layered RMS, ray-traced and Walden angles, binning, angle gather, partial stack, usable angle) | 11 jest gates on a flat layered earth, 3 negative controls | Professional M04 and capstone |
| G2 | `qi/prestackQc.js` (NMO stretch, stretch-mute offset, residual moveout, fold summary) | 8 gates | Professional M03 and capstone |
| G3 | `qi/avo.js` (Aki-Richards, Shuey terms, `fitShuey`, contrasts from A and B, background trend, off-trend, chi projection, class) | 6 gates | Professional M05 and capstone |
| G4 | `qi/wavelets.js` (resample, normalise, align, compare) | 6 gates | Professional M02 |
| G5 | `qi/lfm.js` (map to well time, IDW LFM trace, blind-well score) | 8 gates | Expert M01 and M02 |
| G6 | `qi/seismicQc.js` remainder (`averageSpectrum` on arbitrary traces with taper, `snrFromCoherency`, `footprint`) | designed S/N and stripe truths | Associate M03 and capstone |
| G7 | QI maths that lives in the Suite app, outside the engines: `avoWells.compareAtWells` (one scale, class agreement, misfit); `inversionRun.waveletScale` and `blindWellTable`; `angleWavelets.extractAngleWavelets`; `propertyRun.calibrateProperty` (left-out wells and the widened band, #987); `prospects.climbToCrest` and `analyseProspect` | Suite jest only; three of these files are imported by the worker | Professional M06, Expert M02, M04, M05 and capstones |
| G8 | `qi/prospectAssessment.js` (`anomalyConformance`, implied contact, evidence independence) | analytic paraboloid volume in jest | Expert M05 and capstone |

Not needed by the course, left as they are: `qi/gatherStore.js` (storage
layout), `qi/conditioning.js` (taught in Professional M05 l05 without a
graded value), the usability matrix (`usability.js`, rule-based; it is
taught and examined in the bank, and the numeric grader cannot grade a
category).

### The gap-closing work (engines PRs)

Every new oracle is stdlib Python with no shared code, self-asserting
anchors, byte-identical regeneration, a planted-defect negative control, and
refuses to report a pass on an empty sweep.

| PR | scope | size (estimate) |
|---|---|---|
| E1a | G1 + G2: `oracle_prestack.py`, `goldens.prestack.json`, `goldens.prestackQc.json`; anchors: Dix on a two-layer earth, Snell ray trace against a published table, NMO stretch t(x)/t0 - 1 closed form | S to M: about 600 lines oracle and fixtures, 2 suites rewired |
| E1b | G3 + G4: `oracle_qi_avo.py` reusing nothing from the JS, anchored to the rockphysics oracle's Zoeppritz and Shuey goldens and to Castagna-Swan-Foster; wavelet resampling (sinc) and alignment | S: about 400 lines |
| E1c | G5 + G6 + G8: IDW and blind-well score; spectrum of arbitrary traces with the stated taper, coherency S/N on seeded traces, footprint periodogram; conformance on a discretised paraboloid | M: about 700 lines |
| E2 | G7: move the app-side QI maths into `engines/qi/` (`avoWells.js`, `inversionQc.js` for wavelet scale and blind wells, `angleWavelets.js`, `propertyCalibration.js`, `prospectTrap.js`), each with goldens and an oracle; then a Suite PR re-vendors, turns the five service files into thin shims over the engine, adds parity tests that pin today's QI Studio outputs, and the worker is redeployed (it imports `inversionRun`, `prestackRun` and `propertyRun`) | M to L: engines about 1,200 lines; Suite PR small but deploy-sensitive |

E1a, E1b and E1c are independent of each other and of E2. Doing E2 is a
decision (D4): without it, AVO at the wells, the porosity band and the trap
figures can be taught but not graded.

### Which capstone answers can be graded

- **Associate** is almost open today: everything except the spectrum of a
  supplied trace set (G6) is already goldened through the rockphysics
  oracles.
- **Professional** needs E1a, E1b and (for AVO at the wells) E2.
- **Expert** is open for inversion, simultaneous inversion and property
  prediction today; the LFM trace needs E1c, the trap and conformance need
  E1c and E2.

## 4. Question bank

396 questions, as every course since DR8: per tier six module banks of 15
plus a 42-question final exam (132 a tier). The bank format and gates are
the wave kit's (`/root/dc-wavekit/BANK_TASK.md`, `bankkit.py`):

- **Answer-length gate** (nextgen-bank-answer-length-defect): every length
  rank capped at 40 percent and floored at 12 percent of a bank, so a
  candidate who reads nothing scores near the 25 percent chance line;
  `plan_ranks.py` per bank; lengthen a distractor by naming the mechanism
  it wrongly invokes; never edit the correct option to pass a gate;
  `lengthtails.py` on both tails.
- **Key truth:** every key and every refutation of a distractor rests on a
  line the teaching digest prints; one key-truth audit agent per tier
  before migrations.
- **Key balance and pattern, Jaccard, no positional language, no em or en
  dashes.**
- **At least two questions a module bank turn on a limit, a refusal or a
  margin;** at least six of each exam's 42 need two modules at once.
- **Leak gates:** no bank number within ten tolerances of a graded field
  (`bankleak.py`, three unit shiftings); the repaired `promptleak.py` reads
  `academy_capstones.prompt` from the scratch DB and refuses on an empty
  sweep; `crosspair.py` and `dupaxes.py` include `rockphysics`,
  `seismolord`, `facies` and `uncertainty` as prior courses, because those
  four already examine Shuey and classes, ties and tuning, Bayesian
  classification and Q10/Q50/Q90.
- **Parameters carry Q10, Q50 and Q90 labels** (the PT10 convention) in
  lessons, banks and panels.
- **Video numbers.** The videos quote Ekene numbers measured in QI Studio
  on the full survey (for example blind AI error 7.3 to 8.6 percent
  post-stack). A lesson or question may quote one only if the digest prints
  it in a "Suite run record" section with its provenance; none is ever a
  key the panels must reproduce, and none is graded.

## 5. Capstones per tier

Three capstones, six graded fields each, every field a return value of a
goldened engine through the vendored copy, written by `gen_course.py` from
the engine's own run and checked four ways in the go-live (engine ledger,
second route in SQL where the arithmetic allows, oracle value, discriminate
traps).

**Dataset.** Capstones run on three held-out synthetic cases, built by the
Ekene kit generator's own elastic and seismic code with new parameters and
named at foundation; the Ekene field is the teaching dataset (section 6
explains why). Each case ships as a JSON case file under
`src/content/capstone-cases/qi/` that the prompt names and the learner
pastes into the panel.

| tier | the learner | graded fields (6) | engines |
|---|---|---|---|
| Associate: a feasibility call on one well and a trace patch | runs QC on the case traces, fits the local shear trend on the wet samples, substitutes oil to brine at the zone, reads the crossplot | -6 dB low band edge (Hz); spectral centroid (Hz); local shear trend slope; AI after substitution at the stated sample; Vp/Vs after substitution; distance from the wet trend | `qi/seismicQc` (G6), `rockphysics/elasticSet`, `fluids`, `gassmann`, `avoTrend` |
| Professional: one CDP gather and four wells | builds the angle gather from the stated RMS velocity, checks stretch, stacks near, mid and far, fits Shuey, ties the AVO amplitudes to the modelled ones at four wells | Dix interval velocity of the stated layer; Walden angle at the stated offset and time; NMO stretch at that offset; usable angle at the stated minimum fold; Shuey intercept at the target sample; the one scale over the four wells | `qi/prestack` (G1), `qi/prestackQc` (G2), `qi/avo` (G3), engine `avoWells` (G7) |
| Expert: traces at three wells and a small depth grid | builds the LFM, inverts post-stack and simultaneously, calibrates porosity with one well left out, assesses the prospect | LFM ln(AI) at the target sample; model-based AI at the target sample; simultaneous-inversion Vp/Vs at the target sample; upper bound of the 80 percent porosity interval at the stated AI; posterior probability of the oil-sand facies at the stated AI; closure column height (m) | `qi/lfm` (G5), `qi/inversion`, `qi/prestackInversion`, `qi/propertyPrediction`, `lib/gridding/closure` |

**Tolerance.** The house floor is six decimals (5e-7) and the grader is
`abs(answer - expected) <= tol` in numeric. Closed-form fields (Dix,
Walden, stretch, Shuey, substitution, transform interval, posterior) carry
the floor. Fields that come out of an iterative solver (model-based and
simultaneous inversion) carry a tolerance set by `gradedTolerance.js` from
the measured engine-against-oracle agreement times a stated safety factor,
with the iteration count, `eps` and the wavelet samples all given in the
case file (no wavelet is rebuilt from `Math.exp` in the browser, because
`Math.exp` and `Math.sin` are allowed to differ by an ulp between browser
engines). The discriminate sweep must show every wrong method (no LFM,
the wrong angle convention, a P-label quantile, the un-widened band, the
statistical wavelet in place of the field wavelet) missing by more than its
field's tolerance. No field is a seeded noise draw.

## 6. Datasets and videos

### Which dataset

**Teaching: the Ekene field, QI pack of kit v3.** The videos were recorded
on kit v3 (release `ekene-demo-v3`, kept as it is because the videos link to
it); Rock Physics already teaches on "the Ekene sand at depth", and the
geoscience Associate courses use Ekene fixtures. Teaching on the same field
means a lesson, its panel and its video show the same well, the same sand
and the same numbers (local shear fit on Ekene-1, Vs = -820 + 809.7 Vp,
79 wet samples; AI 22303 to 23260 on substitution; usable angle 32.8
degrees). Kit v4 changed only the seismic structure (the growth fault); the
wells are byte-identical to v3, so either seismic would do, and v3 matches
the recordings. A foundation script cuts a small teaching pack (Ekene-1 to
-4 logs over the zone, checkshots, traces at the wells from the full,
near, mid and far stacks, a dozen CDP gathers, one surface grid) into the
NextGen repo, budget about 2 MB.

**Capstones: held-out synthetic cases.** The members-only videos speak the
Ekene answers aloud, so an Ekene capstone would be answered by watching
F15 or F17. The kit's generator is deterministic, so the same code builds
three new cases with their own elastic layers, fluids and geometry; the
digest records their inputs and the oracle runs on them. The typewell
NextGen Petrophysics uses carries no shear, no seismic and no gathers, so
it cannot carry this course.

### The minimum now

The owner decided on 2026-10-09 that videos are optional enrichment, so
completion and certificates never depend on them. The course can and
should launch with text and panels alone. Recommendation (decision D3):

1. **Build the `{{video:<id>}}` segment and a code registry now**, as a
   small NextGen PR (V1) separate from the course: one parser rule in
   `courseContent.js` beside the panel marker, one `VideoSegment`
   component, and `src/content/videos/registry.js` with id, title,
   duration, chapters, the lesson keys it enriches and a `host` field. An
   entry whose host is not set renders nothing at all.
2. **Write the markers into the lessons from day one** at the places in
   section 2. A1 to A3 render at launch from YouTube (youtube-nocookie,
   public); B4 to F18 sit in the registry with no host and stay invisible.
3. **When the owner picks the private host (Bunny Stream recommended),
   V2 fills the registry and adds one edge function** that checks the
   learner's enrolment at the right tier (`academy_has_scope`) and returns
   a short-lived signed embed URL; the signing key lives only in the
   function's secrets. No lesson file changes, so no `content_version` bump
   and no notice is needed for the QI course.

The alternative, holding the markers back until the host exists, means a
second pass over 15 lessons and a content-version bump later; the
dormant-marker route costs nothing now.

## 7. Migrations and owner steps

Five NextGen migrations, generated, never hand typed, in the Marine
pattern, prefix after the last on main (`20261118`), so `20261119_qi_*`:

| file | content | when |
|---|---|---|
| `20261119_qi_course.sql` | `academy_apps` row (`qi`, Quantitative Interpretation, geoscience, 80, `coming_soon`, prereq `welldata`) plus the three capstones and their 18 fields | any time after merge |
| `20261119_qi_beginner_deep.sql` | structure from the manifest, 132 questions from the committed bank JSONs | after the course row |
| `20261119_qi_intermediate_deep.sql` | same, Professional | after the course row |
| `20261119_qi_advanced_deep.sql` | same, Expert | after the course row |
| `20261119_qi_go_live.sql` | flips `qi` to `available`; self-asserting four-way checks of every graded field | HELD until the NextGen production site serves `/dashboard/apps/qi` |

No transaction lines in the files; `tools/course-waves/qi/apply_qi.sh`
wraps each in one transaction (and its rolled-back dry run). Each is logged
in NextGen `MIGRATIONS.md`. Agents dry-run on a local scratch DB only
(`scratch_db.sh`); production dry runs and applies are the owner's.

Owner steps, in order:

1. Approve this plan and answer D1 to D5.
2. Merge the engines PRs if the classifier blocks my merge (as with #343
   to #345; use `--merge` so vendored pins stay valid).
3. If E2 goes ahead: cut and upload a Suite zip after the E2 Suite PR (I
   redeploy the worker first and verify).
4. Cut the NextGen zip at the merged main (`bash /root/cut_nextgen_zip.sh
   <full-sha>`), upload to Hostinger and purge; I verify the served build and
   the `/dashboard/apps/qi` chunk.
5. Run `apply_qi.sh` dry run, then apply, for the course row and the three
   deep seeds; then the go-live once step 4 is verified. I verify with
   read-only SELECTs and open the log-flip PR.
6. Videos, when ready: choose the host, create the library, upload B4 to
   F18 (or hand me an API key with upload scope), set the signing secret on
   the NextGen project, deploy the video function. I fill the registry.

## 8. Build waves, PR boundaries and estimate

Estimates are working days of agent time at the pace of the Facilities and
Data & AI waves (a course from foundation to merged PR in about three days
with tier agents in parallel).

| wave | what | PRs | estimate | depends on |
|---|---|---|---|---|
| W0 | owner review of this plan | this PR | owner | |
| E1 | oracles and goldens G1 to G6 and G8 | engines E1a, E1b, E1c | 1.5 days, three in parallel | W0 |
| E2 | app-side QI maths into `engines/qi/` with oracles; Suite re-vendor, shims, parity tests, worker redeploy | engines E2, Suite one PR | 2 days | W0, D4 |
| V1 | `{{video}}` segment and code registry | NextGen one small PR | 0.5 day | W0, D3 |
| C1 | foundation: vendor the QI closure into NextGen (`engines/qi`, newer `rockphysics` files, `lib/gridding/closure`, `lib/fft`) as a ledgered group; teaching pack cut from kit v3; capstone case generator; wave kit (structure, digest, fields, discriminate, oracle check, gates); four panels, lab and tests; learning page and route | inside the course PR | 2 days | E1 merged (E2 for the fields it grades) |
| C2 | 78 lessons, three tier agents | inside the course PR | 1 day | C1 |
| C3 | 396 questions, three bank agents, three key-truth audits, lesson fix pass | inside the course PR | 1.5 days | C2 |
| C4 | five migrations, scratch dry run, every gate, `prove_prior_courses`, PR, merge on green | NextGen course PR | 0.5 day | C3 |
| L1 | owner applies and uploads; go-live; log flip | NextGen log-flip PR | owner | C4 |
| V2 | private host wiring | NextGen one PR | 1 day | host chosen |

Critical path: W0, E1 and E2 in parallel (2 days), C1 to C4 (5 days), so
about 7 working days to a merged course PR, then the owner's upload and
applies. Without E2 it is about 6.5 days and the course grades fewer QI
specific values.

What runs in parallel: E1a, E1b, E1c and E2 together; V1 beside all of
them; the teaching-pack cut and the case generator (Suite `tools/demo-dataset`)
beside E1; the Associate tier can start C2 ahead of the others, because its
gate is open except G6.

## 9. Risks and owner decisions

### Risks

- **Overlap with Rock Physics and Seismic Interpretation.** Mitigated by
  recap lessons that link back, and by running the cross-course gates with
  those courses as priors.
- **Solver determinism across browsers.** Mitigated by stated iterations
  and wavelet samples in case files, and tolerances from measured
  oracle agreement (section 5).
- **E2 touches a shipped app and the worker.** Parity tests must pin
  today's QI Studio outputs byte for byte before the shims land; the
  worker is redeployed before the Suite zip.
- **Held go-lives stack up** behind the next NextGen production upload, as
  in every wave so far.

### Decisions for the owner (all approved as recommended, 2026-10-11)

| # | decision | recommendation |
|---|---|---|
| D1 | Prerequisite: `welldata` as for every geoscience course, or a hard gate on Rock Physics? | `welldata`, as the doctrine says; Rock Physics and Seismic Interpretation recommended on the course page, with recap lessons in each tier. |
| D2 | Datasets: Ekene kit v3 for teaching, held-out synthetic cases for capstones? | Yes. The videos speak the Ekene answers, so the graded cases must be new; teaching on Ekene keeps lessons, panels and videos in step. |
| D3 | Videos: build the `{{video}}` segment and code registry now, ship the markers dormant, and pick the private host later? | Yes, and choose Bunny Stream when ready (signed embed URLs from one edge function that checks the enrolment). A1 to A3 go live at launch from YouTube. |
| D4 | Close G7 by moving the app-side QI maths into the engines (E2), with a Suite re-vendor and a worker redeploy? | Yes. It lets the course grade AVO at the wells, the widened porosity band and the trap, and it puts the QI Studio numbers behind an oracle as well. |
| D5 | Name and slug: Quantitative Interpretation, `qi`, Geoscience, path_order 80? | Yes. |
