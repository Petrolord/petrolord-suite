#!/usr/bin/env bash
# =============================================================================
# AI Evaluation Studio (Data & AI D5): negative control on the APP layer.
#
# The engine has its own negative control (packages/engines/tools/validation/
# dataai/negcontrol_evaluate.sh, 68 engine plants). This one plants defects in
# the Suite code between the user and the engine (the spec parser, the
# arguments passed to retrieve, rankBm25, rankTfidf, evaluateRetrieval,
# bootstrapMean, pairedBootstrap, checkAnswers, answerMatch, scoreExtraction,
# cohenKappa and calibration, the run sources, the included-query values,
# the upload readers and caps, the helper context, the stamps, the CSV, the
# compare table and the edge function's cap) and proves the app tests go red
# for each. A plant that stays green is a gap in the gates.
#
# Each plant is one exact text replacement in one file (python, so the
# match is literal and must be found exactly once), then the D5 suites run,
# then the file is restored from its backup whatever happens.
#
# Usage: tools/validation/dataai/negcontrol_eval_studio.sh   (from the repo root)
# Exit 0 when every plant went red and the restored baseline is green.
# =============================================================================
set -u
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$ROOT"
LOG=${TMPDIR:-/tmp}/negcontrol_eval_studio.log
SUITES="src/utils/dataAi/__tests__/evalWorkflows.test.js src/utils/dataAi/__tests__/evalPersistence.test.js src/pages/apps/__tests__/aiEvaluationStudio.smoke.test.jsx src/__tests__/dataAiRegistration.test.js supabase/functions/ai-eval-assist/__tests__/logic.test.ts"

run_suites() { npx jest $SUITES >"$LOG" 2>&1; }

W=src/utils/dataAi/evalWorkflows.js
DATA=src/utils/dataAi/evalData.js
PLANTS=(
  "a blank setting read as 0 instead of the engine default|$W|return t === '' ? undefined : Number(t);|return t === '' ? 0 : Number(t);"
  "BM25 b dropped from the retrieval run|$W|    if (p.b !== undefined) args.b = p.b;|    if (false) args.b = p.b;"
  "stop list not passed to the explained query|$W|const common = { documents: dataset.documents, query: query.text, stopWords: p.stopWords };|const common = { documents: dataset.documents, query: query.text, stopWords: false };"
  "sublinear tf never passed|$W|    args.sublinearTf = p.sublinearTf;|    args.sublinearTf = false;"
  "relevance threshold dropped from the metrics|$W|  if (p.relevantGrade !== undefined) a.relevantGrade = p.relevantGrade;|"
  "gain choice ignored (always linear)|$W|const a = { noRelevant: p.noRelevant, gain: p.gain };|const a = { noRelevant: p.noRelevant, gain: 'linear' };"
  "no-relevant rule ignored (always exclude)|$W|const a = { noRelevant: p.noRelevant, gain: p.gain };|const a = { noRelevant: 'exclude', gain: p.gain };"
  "a system's citations used as its ranked list|$W|runs[a.query] = a.retrieved;|runs[a.query] = a.citations;"
  "excluded queries kept in the compared values|$W|const rows = evaluation.perQuery.filter((r) => !excluded.has(r.query));|const rows = evaluation.perQuery;"
  "bootstrap seed shifted|$W|  if (c.seed !== undefined) a.seed = c.seed;|  if (c.seed !== undefined) a.seed = c.seed + 1;"
  "pairing toggle ignored (always paired)|$W|    a: va.values, b: vb.values, ...bootArgs(c), paired: c.paired,|    a: va.values, b: vb.values, ...bootArgs(c), paired: true,"
  "system B's interval bootstrapped from A's values|$W|out.bootB = EV.bootstrapMean({ values: vb.values, ...bootArgs(c) });|out.bootB = EV.bootstrapMean({ values: va.values, ...bootArgs(c) });"
  "replicate cap off by one|$W|&& nBoot > APP_CAPS.BOOT_MAX|&& nBoot >= APP_CAPS.BOOT_MAX"
  "answers checked without the retrieved lists|$W|  if (withRuns) args.runs =|  if (false) args.runs ="
  "numeric tolerance dropped from the answers check|$W|  if (p.numericRelTol !== undefined) args.numericRelTol = p.numericRelTol;|"
  "short answer and reference swapped|$W|match: EV.answerMatch({ prediction: a.short, truth: refs.get(a.query) })|match: EV.answerMatch({ prediction: refs.get(a.query), truth: a.short })"
  "extraction always scores system A|$W|const predictions = ex.predictions?.[system];|const predictions = ex.predictions?.A;"
  "second grader replaced by the first|$W|      b.push(g2);|      b.push(dataset.judgments[q][d]);"
  "calibration bins not passed|$W|  if (parsed.calibration.bins !== undefined) args.bins = parsed.calibration.bins;|"
  "helper sent more than ten passages|$W|const ids = rank.ranking.slice(0, ASSIST_MAX_PASSAGES).map((r) => r.id);|const ids = rank.ranking.slice(0, 20).map((r) => r.id);"
  "CSV read with the wrong delimiter|$DATA|const delimiter = ext === 'csv' ? ',' :|const delimiter = ext === 'csv' ? ';' :"
  "passage cap off by one|$DATA|if (documents.length > APP_CAPS.PASSAGES) {|if (documents.length >= APP_CAPS.PASSAGES) {"
  "unjudged queries passed to the metrics|$DATA|export const judgedQueryIds = (dataset) => (dataset ? dataset.queries.filter((q) => dataset.judgments[q.id]).map((q) => q.id) : []);|export const judgedQueryIds = (dataset) => (dataset ? dataset.queries.map((q) => q.id) : []);"
  "compare result not marked stale when the seed changes|src/utils/dataAi/evalStudy.js|      m: { ...spec.metrics, source: undefined }, c: spec.compare,|      m: { ...spec.metrics, source: undefined }, c: { ...spec.compare, seed: undefined },"
  "CSV rounds numbers to 6 decimals|src/utils/dataAi/evalReport.js|  const s = v === null \|\| v === undefined ? '' : String(v);|  const s = v === null \|\| v === undefined ? '' : (typeof v === 'number' ? v.toFixed(6) : String(v));"
  "interval labels swapped in the compare table|src/components/dataai/evaluate/ComparePanel.jsx|\${out.paired.labels.lower} to \${out.paired.labels.upper}|\${out.paired.labels.upper} to \${out.paired.labels.lower}"
  "relevance threshold hidden (no box)|src/components/dataai/evaluate/MetricsPanel.jsx|        testId=\"met-grade\"|        testId=\"met-grade-hidden\""
  "helper answer shown without the not-graded label|src/components/dataai/evaluate/AnswersPanel.jsx|>Model output, not graded</p>|>Model output</p>"
  "edge function cap raised to 2000|supabase/functions/ai-eval-assist/logic.ts|export const DAILY_CAP = 200;|export const DAILY_CAP = 2000;"
  "edge function personal cap raised to 400|supabase/functions/ai-eval-assist/logic.ts|export const USER_DAILY_CAP = 40;|export const USER_DAILY_CAP = 400;"
  "personal cap not sent to the reserve function|supabase/functions/ai-eval-assist/index.ts|p_cap: DAILY_CAP, p_user_cap: USER_DAILY_CAP,|p_cap: DAILY_CAP,"
  "reasoning model sent temperature 0 as well|supabase/functions/ai-eval-assist/logic.ts|  else body.temperature = 0;|  body.temperature = 0;"
  "gpt-4o-mini treated as a reasoning model|supabase/functions/ai-eval-assist/logic.ts|  return /^o\\d/.test(m);|  return /^o/.test(m) \|\| m.includes('4o');"
  "an out-of-list reasoning effort passed through|supabase/functions/ai-eval-assist/logic.ts|  if ((REASONING_EFFORTS as readonly string[]).includes(v)) return|  if (true) return"
  "cap message names the organization for a personal cap|supabase/functions/ai-eval-assist/logic.ts|  if (hit === 'user') {|  if (hit === 'nobody') {"
  "edge function keeps no membership check|supabase/functions/ai-eval-assist/index.ts|rpc('is_org_member', { org_id: organizationId })|rpc('is_org_member_skipped', { org_id: organizationId })"
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
