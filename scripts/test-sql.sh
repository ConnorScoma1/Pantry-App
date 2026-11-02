#!/usr/bin/env bash
# Runs every supabase/tests/*.sql smoke test against a throwaway database:
# platform stub + all migrations + seeds, then each test (each rolls back).
# Needs psql and a Postgres 15+ server you can create databases on — set the
# usual PGHOST / PGPORT / PGUSER / PGPASSWORD (CI uses a postgres service).
# Never point this at your real Supabase project.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DB=${KP_TEST_DB:-kp_sql_tests}

psql -v ON_ERROR_STOP=1 -d postgres -q -c "drop database if exists $DB" -c "create database $DB"
cat "$ROOT/scripts/sql/platform_stub.sql" "$ROOT"/supabase/migrations/*.sql "$ROOT/supabase/seed.sql" "$ROOT/supabase/seed_recipes.sql" \
  | psql -v ON_ERROR_STOP=1 -q -d "$DB" >/dev/null

fail=0
for t in "$ROOT"/supabase/tests/*.sql; do
  out=$(psql -d "$DB" -At -F ' | ' -f "$t" 2>&1 || true)
  total=$(grep -cE '\| (t|f)$' <<<"$out" || true)
  bad=$(grep -E '\| f$|ERROR' <<<"$out" || true)
  echo "$(basename "$t"): $total checks"
  if [ -n "$bad" ] || [ "$total" -eq 0 ]; then
    echo "$bad"
    fail=1
  fi
done
psql -d postgres -q -c "drop database if exists $DB"
exit $fail
