#!/usr/bin/env bash
# Prints ONE DO statement that runs the migration's body and then the whole
# pentest, which ALWAYS raises its result. A single statement that ends in an
# exception is rolled back by Postgres whatever runs it and however it is
# sent: it cannot commit. It gives up after 3 s if it cannot get a lock.
# Read the result in the error text ("RESERVOIR-SHARING PENTEST PASS ...").
#
#   scratch:  bash dry-run-sql.sh | docker exec -i <container> psql -U postgres
#   linked:   bash dry-run-sql.sh > /tmp/reservoir-sharing-dry-run.sql && supabase db query --linked -f /tmp/reservoir-sharing-dry-run.sql
set -euo pipefail
cd "$(dirname "$0")"
M=../../../supabase/migrations/20261002130000_reservoir_record_sharing.sql
for f in "$M" pentest.sql; do
  if grep -qiE '^\s*(begin|commit|rollback)\s*;' "$f"; then echo "FAIL $f carries its own begin/commit" >&2; exit 1; fi
done
# each file is one DO statement: "declare ... begin ... end" between its tags
BODY=$(awk '/^do \$reservoir\$/{f=1; next} /^\$reservoir\$;/{exit} f {print}' "$M")
PEN=$(awk '/^do \$pentest\$/{f=1; next} /^\$pentest\$;/{exit} f {print}' pentest.sql)
[ -n "$BODY" ] && [ -n "$PEN" ] || { echo "FAIL could not read the migration body or the pentest" >&2; exit 1; }
# nothing but comments may sit outside the two DO statements
for pair in "$M:reservoir" "pentest.sql:pentest"; do
  f=${pair%%:*}; tag=${pair##*:}
  if awk -v t="$tag" '$0 ~ "^do \\$" t "\\$" {f=1; next} $0 ~ "^\\$" t "\\$;" {f=0; next} !f && !/^\s*(--.*)?$/ {bad=1} END {exit !bad}' "$f"; then
    echo "FAIL $f has statements outside its DO block" >&2; exit 1
  fi
done
cat <<SQL
do \$dryrun\$
begin
  perform set_config('lock_timeout', '3000', true);
  -- the migration
$BODY;
  -- the pentest, which always raises
$PEN;
  raise exception 'RESERVOIR-SHARING DRY RUN: the pentest did not raise; nothing is kept';
end
\$dryrun\$;
SQL
