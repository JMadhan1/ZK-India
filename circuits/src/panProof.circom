pragma circom 2.1.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "helpers/nullifier.circom";
include "helpers/issuerCredential.circom";

/*
 * ZKGate India — PAN Proof
 *
 * Proves "I hold a PAN, and it is linked to the Aadhaar I am proving with"
 * without revealing the PAN number.
 *
 * The interesting output here is `pan_pseudonym` = Poseidon(pan_hash,
 * verifier_id). It gives a verifier exactly one capability and no more: they can
 * tell whether two proofs came from the same PAN holder, which is what dedup and
 * fraud rules actually need. They cannot recover the PAN (Poseidon is one-way
 * over a high-entropy preimage), and because verifier_id is mixed in, the
 * pseudonym a bank sees is unlinkable to the one the tax portal sees. Two
 * verifiers pooling their logs cannot join on it.
 *
 * On the issuer credential (replaces BOTH the old signature_valid AND
 * pan_linked stubs):
 *
 *   The previous version took two client-asserted bits: `signature_valid`
 *   (the Aadhaar signature) and `pan_linked` (whether NSDL/Protean actually
 *   confirmed this PAN belongs to this Aadhaar). Replacing only the first
 *   and leaving `pan_linked` as a self-asserted 1 would be a second stub
 *   wearing the first one's clothes — a client could still claim linkage
 *   that was never checked.
 *
 *   Instead, the enrolment issuer (the same reference issuer as every other
 *   circuit here — see scripts/issuer/issue_credential.mjs) is the one who
 *   performs the real PAN-linkage check (NSDL/Protean, or synthetic for this
 *   prototype) and signs a commitment over (pan_hash, aadhaar_secret). The
 *   circuit then proves knowledge of a genuine issuer signature over THIS
 *   pan_hash and THIS secret — see helpers/issuerCredential.circom's
 *   IssuerCredentialCheckN(1). The mere existence of that signature IS the
 *   linkage attestation; there is no separate boolean left to self-assert.
 *
 * SCOPE — read this before believing the claim:
 *
 *   Trust still rests on the issuer having genuinely checked NSDL/Protean
 *   linkage before signing, and on the issuer's key being genuinely
 *   restricted to registered AUAs/KUAs (backend/services/issuer_registry.py)
 *   — the same trust surface every other circuit here now has, not a zero
 *   one. There is still no in-circuit NSDL/Protean signature check; that
 *   would be a further, larger project analogous to the offline-XML spike
 *   in docs/XML_SIGNATURE_SPIKE.md.
 */
template PanProof() {
    // ── Private ──
    signal input pan_hash;         // Poseidon commitment to the 10-char PAN
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
    signal output pan_pseudonym;   // per-verifier, non-reversible PAN handle

    // ── 1. The citizen must hold a genuine issuer-signed credential over
    //       THIS pan_hash and THIS secret — replaces both the old
    //       signature_valid and pan_linked stubs (see header note). ──
    component cred = IssuerCredentialCheckN(1);
    cred.attrs[0]          <== pan_hash;
    cred.aadhaar_secret    <== aadhaar_secret;
    cred.issuer_sig_r8x    <== issuer_sig_r8x;
    cred.issuer_sig_r8y    <== issuer_sig_r8y;
    cred.issuer_sig_s      <== issuer_sig_s;
    cred.issuer_pubkey_ax  <== issuer_pubkey_ax;
    cred.issuer_pubkey_ay  <== issuer_pubkey_ay;

    // A PAN commitment of 0 would mean "no PAN" and must not sneak through as a
    // valid holder. IsZero forces the client to have committed to something.
    component pan_present = IsZero();
    pan_present.in <== pan_hash;
    pan_present.out === 0;

    component nul = NullifierHash();
    nul.aadhaar_secret   <== aadhaar_secret;
    nul.verifier_id      <== verifier_id;
    nul.expiry_timestamp <== expiry_timestamp;
    nullifier <== nul.nullifier;

    // Scoped to the verifier — deliberately NOT scoped to expiry, because the
    // whole point is that it stays stable for this verifier across sessions so
    // they can recognise a returning PAN holder.
    component pseudo = Poseidon(2);
    pseudo.inputs[0] <== pan_hash;
    pseudo.inputs[1] <== verifier_id;
    pan_pseudonym <== pseudo.out;

    // ── 2. is_valid is definitionally 1: the issuer credential check and the
    //       pan_present check above are both hard assertions already (see
    //       citizenshipProof.circom for the same pattern). Retained as an
    //       output purely for public-signal-layout uniformity. ──
    is_valid <== 1;
}

component main {public [
    verifier_id,
    expiry_timestamp,
    issuer_pubkey_ax,
    issuer_pubkey_ay
]} = PanProof();
