#!/usr/bin/env bash
#
# ZKGate India — Circuit build pipeline
#
# Compiles every circuit, runs a Powers of Tau ceremony, and produces the
# proving key (.zkey) and verification key (.json) for each.
#
# Run from the repo root:  npm run build:circuits
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CIRCUITS="$ROOT/circuits"
SNARKJS="npx --no-install snarkjs"
PTAU_POWER=12   # 2^12 = 4096 constraints; the largest circuit uses ~1,125

CIRCUIT_NAMES=(ageProof locationProof citizenshipProof compoundProof panProof)

# snake_case artifact name for each camelCase circuit — the backend and SDK key
# off these, so keep the two lists aligned.
snake() {
  case "$1" in
    ageProof)         echo "age_proof" ;;
    locationProof)    echo "location_proof" ;;
    citizenshipProof) echo "citizenship_proof" ;;
    compoundProof)    echo "compound_proof" ;;
    panProof)         echo "pan_proof" ;;
  esac
}

echo "============================================"
echo " ZKGate India — Circuit Build"
echo "============================================"

command -v circom >/dev/null 2>&1 || {
  echo "circom not found. Install it: https://docs.circom.io/getting-started/installation/" >&2
  exit 1
}
[ -d "$ROOT/node_modules/circomlib" ] || {
  echo "circomlib missing. Run 'npm install' at the repo root first." >&2
  exit 1
}

mkdir -p "$CIRCUITS/build" "$CIRCUITS/keys"

# ── 1. Compile ───────────────────────────────────────────────────────────────
for name in "${CIRCUIT_NAMES[@]}"; do
  echo ""
  echo "── Compiling $name ──"
  mkdir -p "$CIRCUITS/build/$name"
  circom "$CIRCUITS/src/$name.circom" \
    --r1cs --wasm --sym \
    -o "$CIRCUITS/build/$name" \
    -l "$ROOT/node_modules"
done

# ── 2. Powers of Tau (phase 1, circuit-independent) ──────────────────────────
#
# NOTE ON TRUST: this generates a fresh ceremony with entropy from this machine.
# That is fine for a prototype and NOT fine for production — a single participant
# who keeps their toxic waste can forge proofs for every circuit here. A real
# deployment must use a multi-party ceremony (e.g. Hermez ptau) with independent
# contributors. See docs/TRUSTED_SETUP.md.
#
PTAU="$CIRCUITS/keys/pot${PTAU_POWER}_final.ptau"
if [ ! -f "$PTAU" ]; then
  echo ""
  echo "── Powers of Tau ceremony (2^$PTAU_POWER) ──"
  $SNARKJS powersoftau new bn128 "$PTAU_POWER" "$CIRCUITS/keys/pot_0000.ptau" -v
  $SNARKJS powersoftau contribute "$CIRCUITS/keys/pot_0000.ptau" "$CIRCUITS/keys/pot_0001.ptau" \
    --name="ZKGate India contribution #1" -v -e="$(head -c 64 /dev/urandom | base64)"
  $SNARKJS powersoftau prepare phase2 "$CIRCUITS/keys/pot_0001.ptau" "$PTAU" -v
  rm -f "$CIRCUITS/keys/pot_0000.ptau" "$CIRCUITS/keys/pot_0001.ptau"
else
  echo ""
  echo "── Reusing existing Powers of Tau: $(basename "$PTAU") ──"
fi

# ── 3. Per-circuit keys (phase 2) ────────────────────────────────────────────
for name in "${CIRCUIT_NAMES[@]}"; do
  out="$(snake "$name")"
  echo ""
  echo "── Keys for $name → $out ──"
  $SNARKJS groth16 setup \
    "$CIRCUITS/build/$name/$name.r1cs" \
    "$PTAU" \
    "$CIRCUITS/keys/${out}_0000.zkey"
  $SNARKJS zkey contribute \
    "$CIRCUITS/keys/${out}_0000.zkey" \
    "$CIRCUITS/keys/${out}_final.zkey" \
    --name="ZKGate $out key" -v -e="$(head -c 64 /dev/urandom | base64)"
  $SNARKJS zkey export verificationkey \
    "$CIRCUITS/keys/${out}_final.zkey" \
    "$CIRCUITS/keys/${out}_verification_key.json"
  rm -f "$CIRCUITS/keys/${out}_0000.zkey"
done

# ── 4. Ship the WASM + proving keys to the citizen portal ────────────────────
#
# The citizen's browser needs both to build a proof locally. They are served as
# static assets; nothing about them is secret (the proving key is public by
# design — only the setup's toxic waste ever was).
#
PUB="$ROOT/frontend/public/circuits"
mkdir -p "$PUB"
for name in "${CIRCUIT_NAMES[@]}"; do
  out="$(snake "$name")"
  cp "$CIRCUITS/build/$name/${name}_js/$name.wasm" "$PUB/${out}.wasm"
  cp "$CIRCUITS/keys/${out}_final.zkey"            "$PUB/${out}.zkey"
done

# The backend verifies, so it only needs the (small) verification keys. It reads
# them straight from circuits/keys via CIRCUIT_KEYS_DIR — no copy needed.

echo ""
echo "============================================"
echo " Done."
echo "============================================"
ls -la "$CIRCUITS/keys" | grep -E "verification_key|final.zkey" || true
echo ""
echo "Citizen portal assets → frontend/public/circuits/"
du -sh "$PUB" 2>/dev/null || true
