#!/usr/bin/env bash
# =============================================================================
# Production Forecasting ML Workbench (Data & AI D4): negative control on the
# APP layer.
#
# The engine has its own negative control (packages/engines/tools/validation/
# dataai/negcontrol_forecast.sh, 51 plants). This one plants defects in the
# Suite code between the user and the engine (the spec parser, the default
# first origin, the arguments passed to fitSmoothing, forecastIntervals and
# compareWithArps, the upload and spine readers, the field summary, the
# worker progress, the interval table and the CSV) and proves the app tests
# go red for each. A plant that stays green is a gap in the gates.
#
# Each plant is one exact text replacement in one file (python, so the
# match is literal and must be found exactly once), then the D4 suites run,
# then the file is restored from its backup whatever happens.
#
# Usage: tools/validation/dataai/negcontrol_forecast_workbench.sh   (from the repo root)
# Exit 0 when every plant went red and the restored baseline is green.
# =============================================================================
set -u
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$ROOT"
LOG=${TMPDIR:-/tmp}/negcontrol_forecast_workbench.log
SUITES="src/utils/dataAi/__tests__/forecastWorkflows.test.js src/utils/dataAi/__tests__/forecastJobs.test.js src/utils/dataAi/__tests__/forecastRunsService.test.js src/pages/apps/__tests__/forecastingMlWorkbench.smoke.test.jsx"

run_suites() { npx jest $SUITES >"$LOG" 2>&1; }

PLANTS=(
  "a blank parameter read as 0 (held) instead of estimated|src/utils/dataAi/forecastWorkflows.js|return s === '' ? undefined : Number(s);|return s === '' ? 0 : Number(s);"
  "typed parameters dropped from the fit|src/utils/dataAi/forecastWorkflows.js|y, method: m, ...parsed.params[m], h: parsed.h,|y, method: m, h: parsed.h,"
  "typed parameters dropped from the bootstrap|src/utils/dataAi/forecastWorkflows.js|y: series.values, method, ...(parsed.params[method] \\|\\| {}), h: parsed.h|y: series.values, method, h: parsed.h"
  "bootstrap seed shifted|src/utils/dataAi/forecastWorkflows.js|h: parsed.h, nSims, seed, nonNegative,|h: parsed.h, nSims, seed: seed + 1, nonNegative,"
  "default first origin two horizons back|src/utils/dataAi/forecastWorkflows.js|Math.max(3, n - 3 * H)|Math.max(3, n - 2 * H)"
  "MASE lag m not passed (always 1)|src/utils/dataAi/forecastWorkflows.js|      m: bt.m,|      m: 1,"
  "refit toggle not passed (always on)|src/utils/dataAi/forecastWorkflows.js|      refit: bt.refit,|      refit: true,"
  "ranked first counted from the bottom of the ranking|src/utils/dataAi/forecastWorkflows.js|if (r.best === method) first += 1;|if (r.ranking[r.ranking.length - 1] === method) first += 1;"
  "field mean over every well, undefined included|src/utils/dataAi/forecastWorkflows.js|meanMetric: count ? sum / count : null|meanMetric: count ? sum / wells.length : null"
  "field progress counted from 0|src/utils/dataAi/forecastWorkflows.js|onProgress?.({ phase: 'wells', done: i + 1, total });|onProgress?.({ phase: 'wells', done: i, total });"
  "missing values zero-filled silently|src/utils/dataAi/forecastData.js|if (missing === 'zero') {|if (missing === 'zero' \\|\\| missing === 'refuse') {"
  "upload rows reversed within a well|src/utils/dataAi/forecastData.js|w.values.push(cell.value === null ? 0 : cell.value);|w.values.unshift(cell.value === null ? 0 : cell.value);"
  "spine month keeps the last row in place of the sum|src/utils/dataAi/forecastData.js|sums.set(k, (sums.get(k) ?? 0) + Number(v));|sums.set(k, Number(v));"
  "spine months skipped two at a time|src/utils/dataAi/forecastData.js|for (let k = first; k <= last; k = nextMonth(k)) {|for (let k = first; k <= last; k = nextMonth(nextMonth(k))) {"
  "injectors offered as producers|src/utils/dataAi/forecastSources.js|return wells.filter((w) => w.well_type !== 'injector' && w.well_type !== 'observation');|return wells;"
  "interval table shows P10 under P90 (labels swapped)|src/components/dataai/forecast/FitPanel.jsx|[pi.n + j, f, r.P90[j], r.P50[j], r.P10[j]]|[pi.n + j, f, r.P10[j], r.P50[j], r.P90[j]]"
  "CSV rounds numbers to 6 decimals|src/utils/dataAi/forecastReport.js|const s = v === null \\|\\| v === undefined ? '' : String(v);|const s = v === null \\|\\| v === undefined ? '' : (typeof v === 'number' ? v.toFixed(6) : String(v));"
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
