pragma circom 2.1.0;

include "helpers/nullifier.circom";
include "helpers/issuerCredential.circom";

/*
 * ZKGate India — Citizenship Proof
 *
 * The smallest useful claim in the system: "I hold an Aadhaar that an
 * enrolment issuer genuinely attested." Nothing else — not a name, not an
 * age, not a district.
 *
 * Strictly this proves *residency*, which is what Aadhaar actually attests;
 * UIDAI issues to residents, not exclusively to citizens. The claim is named
 * india_citizen for continuity with the API surface, and the distinction is
 * spelled out in docs/CLAIMS.md so no verifier is misled by the label.
 *
 * On the issuer credential (replaces the old signature_valid stub):
 *
 *   Previously this circuit took a private `signature_valid` bit and simply
 *   asserted it was 1 — a bit the citizen's own client set, unchecked by any
 *   math. This version proves knowledge of a real EdDSA signature, from a
 *   specific named issuer key, over Poseidon(aadhaar_secret) — the same
 *   pattern circuits/src/ageProof.circom established, generalised via
 *   helpers/issuerCredential.circom's IssuerCredentialCheckSecretOnly(). No
 *   DOB or address attributes are bound in here because this claim makes no
 *   assertion about them; a citizen can no longer self-assert "I hold a
 *   valid Aadhaar" without a genuine issuer signature over their secret.
 */
template CitizenshipProof() {
    // ── Private ──
    signal input aadhaar_secret;
    signal input issuer_sig_r8x;
    signal input issuer_sig_r8y;
    signal input issuer_sig_s;

    // ── Public ──
    signal input verifier_id;
    signal input expiry_timestamp;
    signal input issuer_pubkey_ax;
    signal input issuer_pubkey_ay;

    // ── Public outputs ──
    signal output is_valid;
    signal output nullifier;

    // ── 1. The citizen must hold a genuine issuer-signed credential over
    //       their secret (replaces the old signature_valid stub) ──
    component cred = IssuerCredentialCheckSecretOnly();
    cred.aadhaar_secret   <== aadhaar_secret;
    cred.issuer_sig_r8x   <== issuer_sig_r8x;
    cred.issuer_sig_r8y   <== issuer_sig_r8y;
    cred.issuer_sig_s     <== issuer_sig_s;
    cred.issuer_pubkey_ax <== issuer_pubkey_ax;
    cred.issuer_pubkey_ay <== issuer_pubkey_ay;
    // The EdDSA check inside is a hard assertion — an invalid signature
    // makes the witness unsatisfiable, exactly like ageProof's cred check.

    // ── 2. Replay guard ──
    component nul = NullifierHash();
    nul.aadhaar_secret   <== aadhaar_secret;
    nul.verifier_id      <== verifier_id;
    nul.expiry_timestamp <== expiry_timestamp;
    nullifier <== nul.nullifier;

    // ── 3. is_valid is definitionally 1 here: the only claim this circuit
    //       makes is "a genuine issuer credential exists," and that is
    //       already a hard assertion above (not a boolean to route through).
    //       Retained as an output purely so the public-signal layout stays
    //       uniform across all five circuits (see ageProof.circom). ──
    is_valid <== 1;
}

component main {public [
    verifier_id,
    expiry_timestamp,
    issuer_pubkey_ax,
    issuer_pubkey_ay
]} = CitizenshipProof();
