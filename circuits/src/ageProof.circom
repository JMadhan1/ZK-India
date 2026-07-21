pragma circom 2.1.0;

include "circomlib/circuits/comparators.circom";
include "helpers/dateUtils.circom";
include "helpers/nullifier.circom";
include "helpers/issuerCredential.circom";

/*
 * ZKGate India — Age Proof
 *
 * Proves a citizen's age is at or above a threshold without revealing their
 * date of birth.
 *
 * Private (never leaves the citizen's device):
 *   dob_year / dob_month / dob_day  — parsed from the UIDAI Offline eKYC XML
 *   issuer_sig_r8x/r8y/s            — the enrolment issuer's EdDSA signature
 *                                      over Poseidon(dob_year, dob_month,
 *                                      dob_day, aadhaar_secret) — see
 *                                      helpers/issuerCredential.circom
 *   aadhaar_secret                  — high-entropy secret derived from the XML
 *
 * Public (the verifier supplies these, and sees them):
 *   age_threshold, current_{year,month,day}, verifier_id, expiry_timestamp,
 *   issuer_pubkey_ax, issuer_pubkey_ay — which enrolment issuer signed this
 *   credential; the backend checks this against its issuer registry (see
 *   backend/services/verifier_registry.py) to decide trust_level.
 *
 * Outputs (public):
 *   is_valid   — always 1; see the note on unsatisfiability below
 *   nullifier  — replay guard, reveals nothing about the citizen
 *
 * On is_valid always being 1:
 *
 *   The obvious design makes is_valid a 0/1 answer and lets the verifier read
 *   it. That is a trap. It means an underage citizen still gets a perfectly
 *   valid Groth16 proof, one that merely says "false" — and the whole security
 *   of the system then rests on the verifier remembering to check a boolean.
 *   Any verifier who checks `proof verifies?` and forgets `and is_valid == 1?`
 *   is wide open.
 *
 *   So instead the circuit CONSTRAINS the claim: `is_valid === 1`. A citizen
 *   under the threshold cannot produce a witness at all. "The proof verifies"
 *   and "the claim is true" become the same statement, and the verifier cannot
 *   get it wrong. is_valid is retained as an output purely so the public-signal
 *   layout stays uniform across the four circuits.
 *
 * On the issuer credential (replaces the old signature_valid stub):
 *
 *   Previously this circuit took a private `signature_valid` bit and asserted
 *   it was 1 — a bit the citizen's own client set, unchecked by any math. See
 *   docs/UIDAI_INTEGRATION.md for why that was stubbed, not hidden. This
 *   version proves knowledge of a real EdDSA signature, from a specific named
 *   issuer key, over a commitment to the exact dob/secret used elsewhere in
 *   this same circuit — so the attested attributes and the proved attributes
 *   are cryptographically the same values, not merely asserted to match.
 */
template AgeProof() {
    // ── Private ──
    signal input dob_year;
    signal input dob_month;
    signal input dob_day;
    signal input aadhaar_secret;
    signal input issuer_sig_r8x;
    signal input issuer_sig_r8y;
    signal input issuer_sig_s;

    // ── Public ──
    signal input age_threshold;
    signal input current_year;
    signal input current_month;
    signal input current_day;
    signal input verifier_id;
    signal input expiry_timestamp;
    signal input issuer_pubkey_ax;
    signal input issuer_pubkey_ay;

    // ── Public outputs ──
    signal output is_valid;
    signal output nullifier;

    // ── 1. The citizen must hold a genuine issuer-signed credential over
    //       these exact attributes (replaces the old signature_valid stub) ──
    component cred = IssuerCredentialCheck();
    cred.dob_year          <== dob_year;
    cred.dob_month         <== dob_month;
    cred.dob_day           <== dob_day;
    cred.aadhaar_secret    <== aadhaar_secret;
    cred.issuer_sig_r8x    <== issuer_sig_r8x;
    cred.issuer_sig_r8y    <== issuer_sig_r8y;
    cred.issuer_sig_s      <== issuer_sig_s;
    cred.issuer_pubkey_ax  <== issuer_pubkey_ax;
    cred.issuer_pubkey_ay  <== issuer_pubkey_ay;
    // cred instantiates a hard assertion (ForceEqualIfEnabled inside
    // EdDSAPoseidonVerifier) — an invalid signature makes the witness
    // unsatisfiable, exactly the same non-satisfiability guarantee the age
    // check below relies on.

    // ── 2. Both dates must be real dates (see ValidDate for why this is load-bearing) ──
    component dob_ok = ValidDate();
    dob_ok.year  <== dob_year;
    dob_ok.month <== dob_month;
    dob_ok.day   <== dob_day;

    component now_ok = ValidDate();
    now_ok.year  <== current_year;
    now_ok.month <== current_month;
    now_ok.day   <== current_day;

    // The verifier picks current_*; a malicious one could pick a date far in the
    // future to age the citizen up past a threshold. Requiring dob <= now at
    // least keeps the arithmetic in range; freshness of current_* is enforced
    // server-side against the wall clock (see backend/services/proof_verifier.py).
    component not_future = LessEqThan(12);
    not_future.in[0] <== dob_year;
    not_future.in[1] <== current_year;
    not_future.out === 1;

    // ── 3. Age, computed honestly across the birthday boundary ──
    component age = AgeInYears();
    age.dob_year      <== dob_year;
    age.dob_month     <== dob_month;
    age.dob_day       <== dob_day;
    age.current_year  <== current_year;
    age.current_month <== current_month;
    age.current_day   <== current_day;

    // ── 4. age >= threshold, as a hard constraint ──
    component age_check = GreaterEqThan(8);
    age_check.in[0] <== age.age;
    age_check.in[1] <== age_threshold;

    // ── 5. Replay guard ──
    component nul = NullifierHash();
    nul.aadhaar_secret   <== aadhaar_secret;
    nul.verifier_id      <== verifier_id;
    nul.expiry_timestamp <== expiry_timestamp;
    nullifier <== nul.nullifier;

    // ── 6. Bind it all together, then insist it holds ──
    // The issuer-credential check above is already a hard assertion (an
    // invalid signature makes the witness unsatisfiable), so is_valid only
    // needs to carry the age comparison now — but it is still forced to 1
    // rather than trusted, for the same reason given at the top of this file.
    is_valid <== age_check.out;
    is_valid === 1;
}

component main {public [
    age_threshold,
    current_year,
    current_month,
    current_day,
    verifier_id,
    expiry_timestamp,
    issuer_pubkey_ax,
    issuer_pubkey_ay
]} = AgeProof();
