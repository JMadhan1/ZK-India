pragma circom 2.1.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "helpers/nullifier.circom";

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
 * Compare what the status quo does for the same requirement: hand over the
 * actual PAN, and let every counterparty hold a permanent, cross-linkable
 * national identifier for you.
 *
 * SCOPE — read this before believing the claim:
 *
 *   `pan_linked` is an input the client asserts, not a fact this circuit proves.
 *   There is no NSDL/Protean attestation being checked here. That is the same
 *   gap as `signature_valid` (see docs/UIDAI_INTEGRATION.md): closing it means
 *   verifying an issuer signature INSIDE the circuit. Until then this circuit
 *   demonstrates the privacy construction, not a trustworthy PAN attestation,
 *   and the API reports it as trust_level "demo".
 */
template PanProof() {
    // ── Private ──
    signal input pan_hash;         // Poseidon commitment to the 10-char PAN
    signal input pan_linked;       // 1 if the PAN is attested as linked to this Aadhaar
    signal input signature_valid;  // UIDAI signature on the Aadhaar XML
    signal input aadhaar_secret;

    // ── Public ──
    signal input verifier_id;
    signal input expiry_timestamp;

    // ── Public outputs ──
    signal output is_valid;
    signal output nullifier;
    signal output pan_pseudonym;   // per-verifier, non-reversible PAN handle

    signature_valid === 1;
    pan_linked === 1;

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

    is_valid <== signature_valid * pan_linked;
    is_valid === 1;
}

component main {public [verifier_id, expiry_timestamp]} = PanProof();
