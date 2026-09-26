# Electrofacies Studio: senior test T1

- App: Electrofacies Studio (`/dashboard/apps/data-ai/electrofacies-studio`)
- Wave / position: Wave 2, #32 (Senior Testing Programme)
- Build tested: main plus Wave 2 PRs #655 to #659
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Techlog IPSOM / k-means facies, Petrel NN facies, scikit-learn
- Coverage before T1: D3 build, engine gated against scikit-learn/scipy pins (158) with a negative control

## How it was tested

A new harness, `/dev/electrofacies-studio`, runs on the in-memory Supabase
double with a stand-in user.

The data come from the engine's own seeded generator, `syntheticFacies`:

- 2,000 rows in 4 wells of 500.
- Four facies (sandstone, shaly sand, shale, limestone) in blocky runs.
- GR, RHOB, NPHI and PEF drawn from known per-facies normals.

The data were uploaded as a CSV with a well column and a core-facies
column. I walked PCA, k-means, kNN, CART and the depth tracks at 1366 x 768.

## Verdict

**Demo-ready after T1 (no S1).** The engine answers match what the data
were built from:

| Check | Result |
| --- | --- |
| k-means centres (GR) | 45.6 / 28.2 / 117.5 / 78.3, against generator means 45 / 28 / 118 / 78 |
| k-means against core | ARI 0.989, accuracy 0.996 after one-to-one matching |
| kNN on the held-out well | accuracy 1 |
| CART on the held-out well | accuracy 0.982 |
| PCA eigenvalues | sum to 4 (correlation matrix) |

The screens around those answers had four problems:

- Logs chosen at upload were not proposed for clustering.
- In the depth tracks, k-means clusters wore unrelated colours, so a 99.6
  percent match looked like disagreement.
- Depth ticks were uneven.
- The CART printout carried binary float noise.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| EFACIES-T1-001 | S2 | After an upload with four logs chosen, "Logs to cluster on" was empty and every run was blocked ("Choose at least one log") | With no earlier choice surviving, every loaded log is proposed; resistivity mnemonics default to log10 |
| EFACIES-T1-002 | S2 | Depth tracks coloured cluster numbers independently of the core, so matched columns looked unrelated | When a clustering is matched to the core, each cluster takes its facies' colour, and the legend reads "cluster 0 (shaly_sand)" |
| EFACIES-T1-003 | S3 | Depth ticks at 1049.9, 1099.8, 1149.7 | Round ticks (1050, 1100, ...) |
| EFACIES-T1-004 | S3 | CART thresholds printed as "95.92500000000001" | Shown to 10 significant figures ("95.925") |
| EFACIES-T1-E1 | Enhancement | No harness | `/dev/electrofacies-studio` |

## Observations (not changed)

- Result tables print engine figures to six decimals (for example 0.591169
  and 78.259449). That is deliberate for auditability, but heavy for a
  demo.

## Tests

- `e2e/electrofacies-t1.spec.js`: generates the synthetic data, uploads
  it, runs k-means with no log re-ticking, checks ARI > 0.95 and the
  matched legend.
- Facies jest: 52/52 pass.
