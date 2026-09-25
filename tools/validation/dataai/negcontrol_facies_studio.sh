#!/usr/bin/env bash
# =============================================================================
# Electrofacies Studio (Data & AI D3): negative control on the APP layer.
#
# The engine has its own negative control (packages/engines/tools/validation/
# dataai/negcontrol_cluster.sh, 40 plants). This one plants defects in the
# Suite code between the user and the engine (the design builder, the core
# facies placement, the seeded samples, the elbow join, the matching mode,
# the hold-out, the kNN batches, the final models, the write-back) and
# proves the app tests go red for each. A plant that stays green is a gap in
# the gates.
#
# Each plant is one exact text replacement in one file (python, so the
# match is literal and must be found exactly once), then the D3 suites run,
# then the file is restored from its backup whatever happens.
#
# Usage: tools/validation/dataai/negcontrol_facies_studio.sh   (from the repo root)
# Exit 0 when every plant went red and the restored baseline is green.
# =============================================================================
set -u
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$ROOT"
LOG=${TMPDIR:-/tmp}/negcontrol_facies_studio.log
SUITES="src/utils/dataAi/__tests__/faciesWorkflows.test.js src/utils/dataAi/__tests__/faciesAppLayer.test.js src/pages/apps/__tests__/electrofaciesStudio.smoke.test.jsx"

run_suites() { npx jest $SUITES >"$LOG" 2>&1; }

PLANTS=(
  "seeded sample j = floor(u i), off by one|src/utils/dataAi/faciesWorkflows.js|const j = Math.floor(rng() * (i + 1));|const j = Math.floor(rng() * i);"
  "matching one-to-one only below the facies count (boundary)|src/utils/dataAi/faciesWorkflows.js|const mode = nClusters <= nFacies ? 'one-to-one' : 'majority';|const mode = nClusters < nFacies ? 'one-to-one' : 'majority';"
  "silhouette not sampled above 10,000 rows|src/utils/dataAi/faciesWorkflows.js|if (X.length > SILHOUETTE_MAX_ROWS) {|if (X.length > SILHOUETTE_MAX_ROWS + 1000) {"
  "elbow drop sign flipped|src/utils/dataAi/faciesWorkflows.js|row.drop = prev ? prev.inertia - row.inertia : null;|row.drop = prev ? row.inertia - prev.inertia : null;"
  "elbow sample drawn with another seed|src/utils/dataAi/faciesWorkflows.js|rows = sampleRows(n, ELBOW_SAMPLE_ROWS, seed);|rows = sampleRows(n, ELBOW_SAMPLE_ROWS, seed + 1);"
  "agglomerative sample labels put on the wrong rows|src/utils/dataAi/faciesWorkflows.js|labels[j] = ag.labels ? ag.labels[i] : null;|labels[i] = ag.labels ? ag.labels[i] : null;"
  "chosen hold-out wells trained on and the rest held out|src/utils/dataAi/faciesWorkflows.js|(test.has(groups[i]) ? testIdx : trainIdx).push(j)|(test.has(groups[i]) ? trainIdx : testIdx).push(j)"
  "kNN batches drop the last partial batch|src/utils/dataAi/faciesWorkflows.js|for (let at = 0; at < Xnew.length; at += size) {|for (let at = 0; at + size <= Xnew.length; at += size) {"
  "final kNN on unscaled logs|src/utils/dataAi/faciesWorkflows.js|Xnew: design.X, k: sup.knnK, scale: parsed.scale|Xnew: design.X, k: sup.knnK, scale: 'none'"
  "final CART grown on the training wells only|src/utils/dataAi/faciesWorkflows.js|X: Xof(design.labelled), y: yOf(design.labelled), names: design.names, maxDepth|X: Xof(split.trainIdx), y: yOf(split.trainIdx), names: design.names, maxDepth"
  "interval base inclusive|src/utils/dataAi/faciesData.js|if (r.top <= d && d < r.base) return r.code;|if (r.top <= d && d <= r.base) return r.code;"
  "thinning counted from 1 (1-based entries)|src/utils/dataAi/faciesData.js|if (entry % every !== 0) { counts.thinned += 1; continue; }|if ((entry + 1) % every !== 0) { counts.thinned += 1; continue; }"
  "write-back one sample deep (1-based entries)|src/utils/dataAi/faciesWriteBack.js|at.push(design.rows[j] - start);|at.push(design.rows[j] - start + 1);"
  "training range over every row for kNN and CART|src/utils/dataAi/faciesWriteBack.js|return { rows: design.labelled, basis:|return { rows: design.X.map((_, j) => j), basis:"
  "training range bound counted as outside|src/utils/dataAi/faciesWriteBack.js|if (x[f] < min[f]) { below[f] += 1; out = true; }|if (x[f] <= min[f]) { below[f] += 1; out = true; }"
  "PCA warning left out of the CSV|src/utils/dataAi/faciesReport.js|if (pca.warning) row(|if (false) row("
  "training-range counts left out of the provenance|src/utils/dataAi/faciesWriteBack.js|training_range: trainingRangeProvenance(rangeCheck),|training_range: null,"
  "text facies coded from 1|src/utils/dataAi/faciesWriteBack.js|return { code: (v) => pos.get(v), legend: present.map((v, i) => ({ code: i, label: String(v) })), kind: 'facies' };|return { code: (v) => pos.get(v) + 1, legend: present.map((v, i) => ({ code: i + 1, label: String(v) })), kind: 'facies' };"
)

plant() { # file old new -> 0 when replaced exactly once
  python3 - "$1" "$2" "$3" <<'PY'
import sys
p, old, new = sys.argv[1], sys.argv[2].replace('\\|', '|'), sys.argv[3].replace('\\|', '|')
s = open(p).read()
n = s.count(old)
if n != 1:
    print(f'PLANT NOT FOUND EXACTLY ONCE ({n}) in {p}: {old}')
    sys.exit(3)
open(p, 'w').write(s.replace(old, new))
PY
}

echo "baseline"
if ! run_suites; then echo "BASELINE RED: fix the tests first"; tail -30 "$LOG"; exit 1; fi
echo "  green"

red=0; total=0; bad=0
for entry in "${PLANTS[@]}"; do
  name=${entry%%|*}; rest=${entry#*|}
  file=${rest%%|*}; rest=${rest#*|}
  # split old|new on the first unescaped bar
  old=$(python3 -c 'import sys,re; s=sys.argv[1]; m=re.search(r"(?<!\\)\|", s); print(s[:m.start()])' "$rest")
  new=$(python3 -c 'import sys,re; s=sys.argv[1]; m=re.search(r"(?<!\\)\|", s); print(s[m.end():])' "$rest")
  total=$((total + 1))
  cp "$file" "$file.negbak"
  if ! plant "$file" "$old" "$new"; then bad=$((bad + 1)); mv "$file.negbak" "$file"; continue; fi
  if run_suites; then
    echo "  GREEN (gap): $name"
  else
    red=$((red + 1)); echo "  red: $name ($(grep -E '^Tests:' "$LOG" | tail -1))"
  fi
  mv "$file.negbak" "$file"
done

echo "restored"
if ! run_suites; then echo "RESTORED RUN RED"; exit 1; fi
echo "  green"
echo "$red/$total plants red; $bad not applied"
[ "$red" -eq "$total" ] && [ "$bad" -eq 0 ]
