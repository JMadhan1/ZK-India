pragma circom 2.1.0;

include "circomlib/circuits/poseidon.circom";

/*
 * ZKGate India — Nullifier
 *
 * A nullifier is the one value a verifier gets to keep. It has to do two jobs
 * that pull against each other:
 *
 *   1. Let a verifier notice the SAME citizen coming back (replay, double-spend
 *      of a one-shot proof).
 *   2. Tell that verifier, and anyone who steals their database, nothing
 *      whatsoever about who the citizen is.
 *
 * Poseidon over (aadhaar_secret, verifier_id, expiry) does both. The secret is
 * high-entropy and never leaves the device, so the hash is not invertible or
 * brute-forceable. Binding verifier_id in means the nullifier a bank sees is
 * unlinkable to the one a liquor shop sees — two verifiers colluding cannot
 * join their logs on it. Binding expiry in means a proof minted for one session
 * cannot be replayed into the next one.
 */
template NullifierHash() {
    signal input aadhaar_secret;    // private, per-citizen, never transmitted
    signal input verifier_id;       // public, scopes the nullifier to one verifier
    signal input expiry_timestamp;  // public, scopes it to one session

    signal output nullifier;

    component h = Poseidon(3);
    h.inputs[0] <== aadhaar_secret;
    h.inputs[1] <== verifier_id;
    h.inputs[2] <== expiry_timestamp;

    nullifier <== h.out;
}
