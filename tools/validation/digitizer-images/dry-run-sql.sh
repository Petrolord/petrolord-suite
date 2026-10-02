#!/usr/bin/env bash
# Prints ONE DO statement that applies the bucket migration's body and then
# runs the whole pentest, which ALWAYS raises its result. A single statement
# that ends in an exception is rolled back by Postgres whatever runs it and
# however it is sent: it cannot commit. It gives up after 3 s if it cannot
# get its lock. Read the result in the error text ("DIGITIZER PENTEST: ...").
#
#   scratch:  bash dry-run-sql.sh | docker exec -i <container> psql -U postgres
#   linked:   bash dry-run-sql.sh > /tmp/digitizer-dry-run.sql && supabase db query --linked -f /tmp/digitizer-dry-run.sql
set -euo pipefail
cd "$(dirname "$0")"
M=../../../supabase/migrations/20261002091000_digitizer_images_bucket.sql
for f in "$M" pentest.sql; do
  if grep -qiE '^\s*(begin|commit|rollback)\s*;' "$f"; then echo "FAIL $f carries its own begin/commit" >&2; exit 1; fi
done
BODY=$(awk '/^do \$digitizer\$/{f=1; next} f && /^begin$/ && !b {b=1; next} /^end$/ && b {exit} b {print}' "$M")
# the pentest's own "declare ... begin ... end", as a nested block
PEN=$(awk '/^do \$pentest\$/{f=1; next} /^\$pentest\$;/{exit} f {print}' pentest.sql)
[ -n "$BODY" ] && [ -n "$PEN" ] || { echo "FAIL could not read the migration body or the pentest" >&2; exit 1; }
cat <<SQL
do \$dryrun\$
begin
  perform set_config('lock_timeout', '3000', true);
$BODY
  -- the pentest, which always raises
  $PEN;
end
\$dryrun\$;
SQL
