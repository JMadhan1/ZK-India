#!/usr/bin/env bash
#
# Run every test suite in the repo. Assumes `npm install` and the Python venv
# (.venv) with `pip install -r backend/requirements.txt` are already done, and
# the circuits are built (npm run build:circuits).
#
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail=0
banner() { echo; echo "════════════════════════════════════════════"; echo " $1"; echo "════════════════════════════════════════════"; }

PY="$ROOT/.venv/Scripts/python.exe"
[ -x "$PY" ] || PY="$ROOT/.venv/bin/python"
[ -x "$PY" ] || PY="python"

banner "Circuit tests (snarkjs)"
# Serial: each file spins up snarkjs worker threads, and running the files in
# parallel (node --test's default) multiplies memory pressure and slows every
# proof to a crawl. --test-concurrency=1 keeps it predictable.
#
# --test-force-exit: snarkjs leaves its global curve's worker threads running,
# which keeps the event loop alive after every assertion has passed, so the
# runner would otherwise hang indefinitely at the end instead of exiting 0.
node --test --test-force-exit --test-concurrency=1 \
  circuits/test/ageProof.test.mjs \
  circuits/test/locationProof.test.mjs \
  circuits/test/compoundProof.test.mjs \
  || fail=1

banner "SDK tests (parsing, encoding parity)"
# Glob the files explicitly rather than passing the bare `test/` directory:
# Node 20 accepts the directory form, but Node 22+ tries to load it as a single
# module and errors with MODULE_NOT_FOUND.
( cd sdk && node --test test/*.mjs ) || fail=1

banner "Backend tests (pytest, real proofs)"
( cd backend && CIRCUIT_KEYS_DIR="../circuits/keys" "$PY" -m pytest -q ) || fail=1

banner "RESULT"
if [ "$fail" -eq 0 ]; then
  echo "All suites passed."
else
  echo "One or more suites FAILED (see above)."
fi
exit "$fail"
