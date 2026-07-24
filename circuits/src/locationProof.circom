pragma circom 2.1.0;

include "circomlib/circuits/comparators.circom";
include "helpers/nullifier.circom";
include "helpers/issuerCredential.circom";

/*
 * ZKGate India — Location Proof
 *
 * Proves a citizen lives in a given state / district / pincode without
 * revealing their address.
 *
 * Granularity ladder (proof_level):
 *   1  country  — "I hold an Aadhaar", no geography at all
 *   2  state    — "I live in Andhra Pradesh"
 *   3  district — "I live in Chittoor district"
 *   4  pincode  — "I live in 517001"
 *
 * A `required_*` field of 0 means "don't care". State codes are Census of India
 * codes (28 = Andhra Pradesh); district codes come from the shared encoder in
 * sdk/src/encoding.ts and backend/services/encoding.py, which must agree.
 *
 * Note what is NOT in this circuit: house number, street, care-of, landmark,
 * post office, village. Those fields exist in the Aadhaar XML and are simply
 * never fed to it. A verifier who wants to know a citizen is in Chittoor learns
 * that they are in Chittoor, and cannot learn which house.
 *
 * On the issuer credential (replaces the old signature_valid stub):
 *
 *   The stub let a client self-assert `signature_valid = 1` regardless of
 *   what state_code/district_code/pincode it fed the circuit — a forged
 *   location could ride along with the asserted bit and nothing would catch
 *   it. Binding only the secret (the way ageProof does for DOB) would NOT be
 *   enough here either: it would prove "a genuine issuer signed something for
 *   this secret," but not that the something was THIS state/district/pincode.
 *   So the commitment the issuer signs must include state_code, district_code
 *   AND pincode alongside the secret — see helpers/issuerCredential.circom's
 *   IssuerCredentialCheckN(3). Change one digit of any of the three after the
 *   issuer signed it and the commitment (and therefore the signature check)
 *   no longer matches, making the witness unsatisfiable. That is the specific
 *   attack a naive secret-only binding would miss.
 */
template LocationProof() {
    // ── Private ──
    signal input state_code;
    signal input district_code;
    signal input pincode;
    signal input aadhaar_secret;
    signal input issuer_sig_r8x;
    signal input issuer_sig_r8y;
    signal input issuer_sig_s;

    // ── Public ──
    signal input required_state_code;     // 0 = any
    signal input required_district_code;  // 0 = any
    signal input required_pincode;        // 0 = any
    signal input proof_level;             // 1..4
    signal input verifier_id;
    signal input expiry_timestamp;
    signal input issuer_pubkey_ax;
    signal input issuer_pubkey_ay;

    // ── Public outputs ──
    signal output is_valid;
    signal output nullifier;
    signal output proved_state_code;

    // ── 1. The citizen must hold a genuine issuer-signed credential over
    //       THESE EXACT state_code/district_code/pincode values (replaces
    //       the old signature_valid stub). Aadhaar is only issued to Indian
    //       residents, so a valid credential IS the country-level claim —
    //       level 1 needs nothing further. ──
    component cred = IssuerCredentialCheckN(3);
    cred.attrs[0]          <== state_code;
    cred.attrs[1]          <== district_code;
    cred.attrs[2]          <== pincode;
    cred.aadhaar_secret    <== aadhaar_secret;
    cred.issuer_sig_r8x    <== issuer_sig_r8x;
    cred.issuer_sig_r8y    <== issuer_sig_r8y;
    cred.issuer_sig_s      <== issuer_sig_s;
    cred.issuer_pubkey_ax  <== issuer_pubkey_ax;
    cred.issuer_pubkey_ay  <== issuer_pubkey_ay;

    // ── 2. Match each field, treating 0 as a wildcard ──
    component state_zero = IsZero();
    state_zero.in <== required_state_code;
    component state_eq = IsEqual();
    state_eq.in[0] <== state_code;
    state_eq.in[1] <== required_state_code;
    // wildcard OR match — both terms are boolean and mutually exclusive
    signal state_valid <== state_zero.out + (1 - state_zero.out) * state_eq.out;

    component dist_zero = IsZero();
    dist_zero.in <== required_district_code;
    component dist_eq = IsEqual();
    dist_eq.in[0] <== district_code;
    dist_eq.in[1] <== required_district_code;
    signal district_valid <== dist_zero.out + (1 - dist_zero.out) * dist_eq.out;

    component pin_zero = IsZero();
    pin_zero.in <== required_pincode;
    component pin_eq = IsEqual();
    pin_eq.in[0] <== pincode;
    pin_eq.in[1] <== required_pincode;
    signal pincode_valid <== pin_zero.out + (1 - pin_zero.out) * pin_eq.out;

    // ── 3. proof_level must be honest about what it is actually proving.
    //       Without this, a verifier could be handed a proof stamped
    //       "level 4 — pincode verified" that in fact constrained nothing,
    //       because every required_* field was left at the 0 wildcard. ──
    component lvl_lo = GreaterEqThan(4);
    lvl_lo.in[0] <== proof_level;
    lvl_lo.in[1] <== 1;
    lvl_lo.out === 1;

    component lvl_hi = LessEqThan(4);
    lvl_hi.in[0] <== proof_level;
    lvl_hi.in[1] <== 4;
    lvl_hi.out === 1;

    // level >= 2 implies a state was actually demanded, and so on up the ladder.
    // "a implies not-b" as an arithmetic constraint is a * b === 0.
    component lvl_ge2 = GreaterEqThan(4);
    lvl_ge2.in[0] <== proof_level;
    lvl_ge2.in[1] <== 2;
    lvl_ge2.out * state_zero.out === 0;

    component lvl_ge3 = GreaterEqThan(4);
    lvl_ge3.in[0] <== proof_level;
    lvl_ge3.in[1] <== 3;
    lvl_ge3.out * dist_zero.out === 0;

    component lvl_ge4 = GreaterEqThan(4);
    lvl_ge4.in[0] <== proof_level;
    lvl_ge4.in[1] <== 4;
    lvl_ge4.out * pin_zero.out === 0;

    // ── 4. Replay guard ──
    component nul = NullifierHash();
    nul.aadhaar_secret   <== aadhaar_secret;
    nul.verifier_id      <== verifier_id;
    nul.expiry_timestamp <== expiry_timestamp;
    nullifier <== nul.nullifier;

    // ── 5. Echo the state back — but ONLY when one was asked for.
    //
    //       If the verifier asked for no state (wildcard), publishing the
    //       citizen's state would leak geography they never requested and the
    //       citizen never agreed to share. When they DID ask, echoing it tells
    //       them nothing they don't already know, and gives them something to
    //       display. So: reveal on request, zero otherwise. ──
    proved_state_code <== state_code * (1 - state_zero.out);

    // ── 6. Constrain, don't merely report (see ageProof for the reasoning).
    //       The AND of three booleans has to be built one multiplication at a
    //       time: R1CS constraints are quadratic, so a * b * c in a single line
    //       is not expressible. ──
    signal state_and_district <== state_valid * district_valid;
    is_valid <== state_and_district * pincode_valid;
    is_valid === 1;
}

component main {public [
    required_state_code,
    required_district_code,
    required_pincode,
    proof_level,
    verifier_id,
    expiry_timestamp,
    issuer_pubkey_ax,
    issuer_pubkey_ay
]} = LocationProof();
