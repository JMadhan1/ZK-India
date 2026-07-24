pragma circom 2.1.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/eddsaposeidon.circom";

/*
 * ZKGate India — Issuer Credential Check
 *
 * Closes the gap documented in docs/UIDAI_INTEGRATION.md: previously every
 * circuit took a private input `signature_valid` and simply asserted it
 * equalled 1 — a bit the citizen's own client set, with nothing in the proof
 * to stop a malicious client setting it regardless of the underlying data.
 *
 * This is "Option 2" from that document: a one-time enrolment step run by a
 * licensed AUA/KUA (an entity already authorised by UIDAI to perform
 * Aadhaar e-KYC — a bank, telco, or Common Service Centre) verifies the
 * citizen's Aadhaar offline e-KYC XML once, the ordinary way, and then signs
 * a Poseidon commitment to the attributes with its own EdDSA (Baby Jubjub)
 * key. The circuit never touches UIDAI's RSA signature directly — it proves
 * knowledge of a valid EdDSA signature over the committed attributes, which
 * is a small circuit (a few thousand constraints) instead of the tens of
 * thousands an in-circuit RSA-SHA256-over-canonicalised-XML check would cost
 * (the approach Anon Aadhaar takes over the public Secure QR code).
 *
 * What this buys over the stub: a citizen can no longer self-assert
 * `signature_valid = 1` over fabricated attributes. They must hold a genuine
 * signature from a registered issuer's private key over the *exact*
 * attributes being proved — change one digit of the DOB and the commitment,
 * and therefore the signature check, fails.
 *
 * What this does NOT remove: trust still rests on the issuer having actually
 * checked UIDAI's signature correctly at enrolment time, and on the
 * issuer's key being genuinely restricted to registered AUAs/KUAs (see the
 * verifier/issuer registry in backend/services/verifier_registry.py). That
 * is a strictly smaller trust surface than the previous stub, not a zero
 * one — and the honest thing is to say so here, the same way the rest of
 * this codebase does.
 */
template IssuerCredentialCheck() {
    // ── Private: the attributes being attested, and the issuer's signature over them ──
    signal input dob_year;
    signal input dob_month;
    signal input dob_day;
    signal input aadhaar_secret;
    signal input issuer_sig_r8x;
    signal input issuer_sig_r8y;
    signal input issuer_sig_s;

    // ── Public: which issuer's key this credential is checked against ──
    // The backend/verifier checks this against its registry of recognised
    // issuer keys (see backend/services/verifier_registry.py) before
    // reporting trust_level: "attested" rather than "demo".
    signal input issuer_pubkey_ax;
    signal input issuer_pubkey_ay;

    // ── Output: the same commitment the issuer signed, exposed so callers
    //    can bind other constraints to it if ever needed. Not public by
    //    default — callers decide whether to expose it. ──
    signal output commitment;

    component commit = Poseidon(4);
    commit.inputs[0] <== dob_year;
    commit.inputs[1] <== dob_month;
    commit.inputs[2] <== dob_day;
    commit.inputs[3] <== aadhaar_secret;
    commitment <== commit.out;

    component sigCheck = EdDSAPoseidonVerifier();
    sigCheck.enabled <== 1;
    sigCheck.Ax  <== issuer_pubkey_ax;
    sigCheck.Ay  <== issuer_pubkey_ay;
    sigCheck.S   <== issuer_sig_s;
    sigCheck.R8x <== issuer_sig_r8x;
    sigCheck.R8y <== issuer_sig_r8y;
    sigCheck.M   <== commitment;
    // EdDSAPoseidonVerifier is a hard assert when enabled = 1: an invalid
    // signature makes the witness unsatisfiable, not a boolean the caller
    // has to remember to check. Same non-satisfiability discipline as the
    // rest of this codebase (see the header note in ageProof.circom).
}

/*
 * Same construction as IssuerCredentialCheck above, generalised to an
 * arbitrary N-attribute commitment: commitment = Poseidon(attrs[0..N-1],
 * aadhaar_secret). Used by every claim circuit whose attested attributes
 * aren't the fixed (dob_year, dob_month, dob_day) triple ageProof uses —
 * e.g. locationProof signs (state_code, district_code, pincode), panProof
 * signs (pan_hash). Keeping ageProof on its own concrete template above
 * avoids disturbing an already-working, already-keyed circuit; every other
 * circuit closing its signature_valid stub uses this one instead of hand
 * duplicating the EdDSA-Poseidon plumbing per circuit.
 */
template IssuerCredentialCheckN(N) {
    signal input attrs[N];
    signal input aadhaar_secret;
    signal input issuer_sig_r8x;
    signal input issuer_sig_r8y;
    signal input issuer_sig_s;
    signal input issuer_pubkey_ax;
    signal input issuer_pubkey_ay;
    signal output commitment;

    component commit = Poseidon(N + 1);
    for (var i = 0; i < N; i++) {
        commit.inputs[i] <== attrs[i];
    }
    commit.inputs[N] <== aadhaar_secret;
    commitment <== commit.out;

    component sigCheck = EdDSAPoseidonVerifier();
    sigCheck.enabled <== 1;
    sigCheck.Ax  <== issuer_pubkey_ax;
    sigCheck.Ay  <== issuer_pubkey_ay;
    sigCheck.S   <== issuer_sig_s;
    sigCheck.R8x <== issuer_sig_r8x;
    sigCheck.R8y <== issuer_sig_r8y;
    sigCheck.M   <== commitment;
}

/*
 * Secret-only variant: commitment = Poseidon(aadhaar_secret). Used by
 * citizenshipProof, whose only claim is "this secret belongs to a real,
 * issuer-attested Aadhaar holder" — no DOB, no address, nothing else to
 * bind in. A dedicated template rather than IssuerCredentialCheckN(0)
 * sidesteps zero-length-array edge cases in circom for no real cost.
 */
template IssuerCredentialCheckSecretOnly() {
    signal input aadhaar_secret;
    signal input issuer_sig_r8x;
    signal input issuer_sig_r8y;
    signal input issuer_sig_s;
    signal input issuer_pubkey_ax;
    signal input issuer_pubkey_ay;
    signal output commitment;

    component commit = Poseidon(1);
    commit.inputs[0] <== aadhaar_secret;
    commitment <== commit.out;

    component sigCheck = EdDSAPoseidonVerifier();
    sigCheck.enabled <== 1;
    sigCheck.Ax  <== issuer_pubkey_ax;
    sigCheck.Ay  <== issuer_pubkey_ay;
    sigCheck.S   <== issuer_sig_s;
    sigCheck.R8x <== issuer_sig_r8x;
    sigCheck.R8y <== issuer_sig_r8y;
    sigCheck.M   <== commitment;
}
