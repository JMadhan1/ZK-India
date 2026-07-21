/**
 * Proof generation — runs on the citizen's device.
 *
 * Given parsed Aadhaar fields and what a verifier is asking for, this builds the
 * circuit witness and produces a Groth16 proof with snarkjs. The private inputs
 * (date of birth, address, the derived secret) go into the witness and are
 * consumed locally; only `{ proof, publicSignals }` comes back out.
 *
 * The aadhaar_secret deserves a word. It is the private value that makes a
 * citizen's nullifiers stable-yet-unlinkable, so it must be (a) high entropy,
 * (b) reproducible for the same person, and (c) never derivable by anyone else.
 * We derive it from the XML's referenceId via Poseidon. In the prototype that is
 * enough to demonstrate the construction; a production wallet would bind it to
 * device-held key material so it cannot be recomputed from the XML alone.
 */

import { groth16 } from "snarkjs";
import { buildPoseidon } from "circomlibjs";

// BN128 scalar field order — the secret must be a residue mod this.
const FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let _poseidon = null;
async function poseidon() {
  if (!_poseidon) _poseidon = await buildPoseidon();
  return _poseidon;
}

/** Deterministically derive the per-citizen secret from their XML referenceId. */
export async function deriveSecret(referenceId) {
  const p = await poseidon();
  // Turn the reference id into a field element by hashing its bytes in.
  const bytes = new TextEncoder().encode(String(referenceId ?? "zkgate-demo"));
  let acc = 0n;
  for (const b of bytes) acc = (acc * 257n + BigInt(b)) % FIELD;
  const h = p([acc, 0n]);
  return p.F.toObject(h) % FIELD;
}

/** Claim -> circuit artifact base name. */
const CLAIM_CIRCUIT = {
  age_above_18: "age_proof", age_above_21: "age_proof", age_above_60: "age_proof",
  voter_eligible: "age_proof",
  state_resident: "location_proof", district_resident: "location_proof",
  india_citizen: "citizenship_proof",
  compound_kyc: "compound_proof",
  pan_holder: "pan_proof",
};

const AGE_THRESHOLD = {
  age_above_18: 18, age_above_21: 21, age_above_60: 60, voter_eligible: 18,
};

function todayParts(now = new Date()) {
  return {
    current_year: now.getUTCFullYear(),
    current_month: now.getUTCMonth() + 1,
    current_day: now.getUTCDate(),
  };
}

/**
 * Build the witness input object for a claim.
 *
 * @param {object} p
 * @param {string} p.claimType
 * @param {object} p.fields     parsed Aadhaar fields (from parseAadhaarXml)
 * @param {bigint|number} p.secret       the derived aadhaar_secret
 * @param {object} p.request    verifier's ask: { verifierId, expiry, requiredStateCode, requiredDistrictCode, requiredPincode, proofLevel, ageThreshold }
 * @param {boolean} p.signatureValid   used by every circuit EXCEPT age_proof, which
 *   has been upgraded to a real in-circuit issuer credential (see p.issuerCredential
 *   below and docs/UIDAI_INTEGRATION.md). The other circuits still take the
 *   client-asserted stub; that upgrade is the documented next step for them too.
 * @param {object} [p.issuerCredential]  REQUIRED for age_proof. The one-time
 *   enrolment signature from scripts/issuer/issue_credential.mjs:
 *   { r8x, r8y, s, pubkeyAx, pubkeyAy } — an EdDSA-Poseidon signature, from a
 *   registered issuer's key, over Poseidon(dob_year, dob_month, dob_day, secret).
 */
export function buildWitness({ claimType, fields, secret, request, signatureValid = true, issuerCredential = null }) {
  const base = {
    aadhaar_secret: secret.toString(),
    verifier_id: String(request.verifierId),
    expiry_timestamp: String(request.expiry),
  };
  const now = todayParts();

  switch (CLAIM_CIRCUIT[claimType]) {
    case "age_proof": {
      if (!issuerCredential) {
        // No silent fallback to the old stub — age_proof no longer has one.
        // Forgetting this is a build-time error, not a proof that quietly
        // asserts a false attestation.
        throw new Error(
          "age_proof requires issuerCredential { r8x, r8y, s, pubkeyAx, pubkeyAy }; " +
            "obtain one from scripts/issuer/issue_credential.mjs (see docs/UIDAI_INTEGRATION.md)",
        );
      }
      return {
        ...base,
        dob_year: fields.dob_year, dob_month: fields.dob_month, dob_day: fields.dob_day,
        age_threshold: request.ageThreshold ?? AGE_THRESHOLD[claimType],
        issuer_sig_r8x: String(issuerCredential.r8x),
        issuer_sig_r8y: String(issuerCredential.r8y),
        issuer_sig_s: String(issuerCredential.s),
        issuer_pubkey_ax: String(issuerCredential.pubkeyAx),
        issuer_pubkey_ay: String(issuerCredential.pubkeyAy),
        ...now,
      };
    }
    case "location_proof":
      return {
        ...base,
        state_code: fields.state_code, district_code: fields.district_code, pincode: fields.pincode,
        required_state_code: request.requiredStateCode ?? 0,
        required_district_code: request.requiredDistrictCode ?? 0,
        required_pincode: request.requiredPincode ?? 0,
        proof_level: request.proofLevel ?? 2,
      };
    case "citizenship_proof":
      return { ...base };
    case "compound_proof":
      return {
        ...base,
        dob_year: fields.dob_year, dob_month: fields.dob_month, dob_day: fields.dob_day,
        state_code: fields.state_code, district_code: fields.district_code, pincode: fields.pincode,
        age_threshold: request.ageThreshold ?? 18,
        required_state_code: request.requiredStateCode ?? 0,
        required_district_code: request.requiredDistrictCode ?? 0,
        ...now,
      };
    case "pan_proof":
      return {
        ...base,
        pan_hash: request.panHash ?? "0",
        pan_linked: request.panLinked ? 1 : 0,
      };
    default:
      throw new Error(`unknown claim type: ${claimType}`);
  }
}

/**
 * Generate a proof.
 *
 * @param {object} p
 * @param {string} p.claimType
 * @param {object} p.witnessInput   from buildWitness()
 * @param {string} p.wasmUrl        URL/path to <circuit>.wasm
 * @param {string} p.zkeyUrl        URL/path to <circuit>.zkey
 * @returns {Promise<{ proof, publicSignals, claimType, circuit, generatedAt }>}
 */
export async function generateProof({ claimType, witnessInput, wasmUrl, zkeyUrl }) {
  const { proof, publicSignals } = await groth16.fullProve(witnessInput, wasmUrl, zkeyUrl);
  return {
    proof,
    publicSignals,
    claimType,
    circuit: CLAIM_CIRCUIT[claimType],
    generatedAt: Math.floor(Date.now() / 1000),
  };
}

export { CLAIM_CIRCUIT };
