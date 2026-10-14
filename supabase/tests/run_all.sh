#!/usr/bin/env bash
# Run every database test against the local Supabase stack. Each test rolls back.
set -euo pipefail
cd "$(dirname "$0")"
db="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
for test in rls matching groups social trust_safety; do
  psql "$db" -v ON_ERROR_STOP=1 -q -f "${test}_test.sql" | grep -E "PASSED" || { echo "FAILED: ${test}_test.sql"; exit 1; }
done
