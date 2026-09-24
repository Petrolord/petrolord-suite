#!/usr/bin/env bash
# =============================================================================
# ML Workbench (Data & AI D2): negative control on the APP layer.
#
# The engine has its own negative control (packages/engines/tools/validation/
# dataai/negcontrol_ml.sh, 41 plants). This one plants defects in the Suite
# code between the user and the engine (the design builder, the fold
# bookkeeping, the scaler wiring, the diagnostics, the write-back) and
# proves the app tests go red for each. A plant that stays green is a gap in
# the gates.
#
# Each plant is one exact text replacement in one file (python, so the
# match is literal and must be found exactly once), then the D2 suites run,
# then the file is restored from its backup whatever happens.
#
# Usage: tools/validation/dataai/negcontrol_ml_workbench.sh   (from the repo root)
# Exit 0 when every plant went red and the restored baseline is green.
# =============================================================================
set -u
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$ROOT"
SUITES="src/utils/dataAi/__tests__/mlWorkflows.ekene.test.js src/utils/dataAi/__tests__/mlJobs.test.js src/utils/dataAi/__tests__/mlRunsService.test.js src/utils/dataAi/__tests__/mlReport.test.js src/pages/apps/__tests__/mlWorkbench.smoke.test.jsx"

run_suites() { npx jest $SUITES >/tmp/negcontrol_ml_workbench.log 2>&1; }

PLANTS=(
  "scaler fitted on all rows|src/utils/dataAi/mlWorkflows.js|const scaler = ML.fitStandardScaler({ X, trainIndices, names });|const scaler = ML.fitStandardScaler({ X, names });"
  "held-out rows predicted unscaled|src/utils/dataAi/mlWorkflows.js|const Xte = pick(sc.X, f.testIndices);|const Xte = pick(X, f.testIndices);"
  "held-out prediction written one row late (1-based)|src/utils/dataAi/mlWorkflows.js|oof[row] = pr.values[j];|oof[row + 1] = pr.values[j];"
  "standardise switch inverted|src/utils/dataAi/mlWorkflows.js|if (!standardise) return { scaler: null, X };|if (standardise) return { scaler: null, X };"
  "importance permuted on the training wells|src/utils/dataAi/mlWorkflows.js|model: fit, X: pick(sc.X, s.testIndices), y: pick(y, s.testIndices),|model: fit, X: pick(sc.X, s.trainIndices), y: pick(y, s.trainIndices),"
  "learning curve always from one well, refusal dropped|src/utils/dataAi/mlWorkflows.js|if (!r.error.startsWith('trainGroupCounts[0] ')) return { error: r.error, skipped };|return { error: r.error, skipped };"
  "leakage verdict sign flipped|src/utils/dataAi/mlWorkflows.js|if (r.optimism > 0) return|if (r.optimism < 0) return"
  "thinning counted from 1 (1-based entries)|src/utils/dataAi/mlData.js|if (entry % every !== 0) { counts.thinned += 1; continue; }|if ((entry + 1) % every !== 0) { counts.thinned += 1; continue; }"
  "natural log in place of log10|src/utils/dataAi/mlData.js|row.push(Math.log10(v));|row.push(Math.log(v));"
  "cutoff comparison inclusive where strict|src/utils/dataAi/mlData.js|const compare = (v, op, c) => (op === '>' ? v > c : op === '>=' ? v >= c|const compare = (v, op, c) => (op === '>' ? v >= c : op === '>=' ? v >= c"
  "write-back curve packed from the top (no depth alignment)|src/utils/dataAi/mlWriteBack.js|at.forEach((row, j) => { data[row] = values[j]; });|at.forEach((row, j) => { data[j] = values[j]; });"
  "prediction rows skip nothing when a feature is missing|src/utils/dataAi/mlData.js|if (v === null \|\| v === undefined \|\| (f.log && !(v > 0))) { ok = false; break; }|if (v === undefined) { ok = false; break; }"
  "pooled scores over every row, tested or not|src/utils/dataAi/mlWorkflows.js|for (let i = 0; i < n; i += 1) if (oof[i] !== null) tested.push(i);|for (let i = 0; i < n; i += 1) tested.push(i);"
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
if ! run_suites; then echo "BASELINE RED: fix the tests first"; tail -30 /tmp/negcontrol_ml_workbench.log; exit 1; fi
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
    red=$((red + 1)); echo "  red: $name ($(grep -E '^Tests:' /tmp/negcontrol_ml_workbench.log | tail -1))"
  fi
  mv "$file.negbak" "$file"
done

echo "restored"
if ! run_suites; then echo "RESTORED RUN RED"; exit 1; fi
echo "  green"
echo "$red/$total plants red; $bad not applied"
[ "$red" -eq "$total" ] && [ "$bad" -eq 0 ]
