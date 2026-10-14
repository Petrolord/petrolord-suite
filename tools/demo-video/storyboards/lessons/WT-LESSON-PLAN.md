# Well Testing with Petrolord: lesson plan

Twelve lessons, Modules A to D, three each, on the Ekene field (kit v4). Each
test was generated from the earth model with a known answer
(`tools/demo-video/seed/wt_assets.mjs` for Ekene-5 and Ekene-11; the kit's
11-production-engineering for Ekene-1). Projects the videos make are named
"WT demo: ..." and "Lesson ...".

| Lesson | Title | Test | Teaches |
|---|---|---|---|
| A1 | The workspace and a first buildup | Ekene-1 | tabs, project, producing time, gauge import, flowing pressure at shut-in |
| A2 | Gauge data and quality control | Ekene-5 | gauge clock, finding the shut-in, readings before it, decimation, spikes |
| A3 | The inputs, and where they come from | Ekene-1 | what each input moves, ct from components, input sources in the report |
| B4 | The Bourdet derivative | Ekene-5 | log derivative, plateau kh, smoothing window L |
| B5 | Flow regimes and how far a test sees | Ekene-5, Ekene-1 | storage, hump, radial flow, boundary rise, radius of investigation |
| B6 | Horner, MDH and p star | Ekene-1 | semilog window, k, skin, p*, MDH cross-check |
| C7 | Matching a model, by hand and by regression | Ekene-1 | homogeneous model, hand match, regression, confidence intervals |
| C8 | Boundaries: a sealing fault | Ekene-5 | infinite vs fault model, image well, Gray's two lines, the geology |
| C9 | Splitting the skin | Ekene-5, Ekene-11 | partial penetration, kv/kh, mechanical skin, slant |
| D10 | A buildup after a rate history | Ekene-11 | superposition time, equivalent time, MDH bending, regression through steps |
| D11 | The report | Ekene-5 | identification, sections, cross-check, limits, PDF |
| D12 | Sending the results on | Ekene-11 | wta-1 record, Material Balance, Waterflood, EOR, Nodal, sharing |

Demos: wt-01 (Ekene-5: gauge file to k, skin and the fault), wt-02 (Ekene-11:
clean-up read on its rate history), wt-03 (Ekene-11 to Nodal Analysis: 736
STB/D as tested, 1,155 STB/D with the damage removed).
