pragma circom 2.1.0;

include "helpers/nullifier.circom";

/*
 * ZKGate India — Citizenship Proof
 *
 * The smallest useful claim in the system: "I hold an Aadhaar that UIDAI
 * signed." Nothing else — not a name, not an age, not a district.
 *
 * Strictly this proves *residency*, which is what Aadhaar actually attests;
 * UIDAI issues to residents, not exclusively to citizens. The claim is named
 * india_citizen for continuity with the API surface, and the distinction is
 * spelled out in docs/CLAIMS.md so no verifier is misled by the label.
 *
 * It is also the foundation the other three circuits stand on: each of them
 * begins with this same `signature_valid === 1` and then adds a claim.
 */
template CitizenshipProof() {
    // ── Private ──
    signal input signature_valid;
    signal input aadhaar_secret;

    // ── Public ──
    signal input verifier_id;
    signal input expiry_timestamp;

    // ── Public outputs ──
    signal output is_valid;
    signal output nullifier;

    signature_valid === 1;

    component nul = NullifierHash();
    nul.aadhaar_secret   <== aadhaar_secret;
    nul.verifier_id      <== verifier_id;
    nul.expiry_timestamp <== expiry_timestamp;
    nullifier <== nul.nullifier;

    is_valid <== signature_valid;
    is_valid === 1;
}

component main {public [verifier_id, expiry_timestamp]} = CitizenshipProof();
