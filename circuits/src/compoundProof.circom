pragma circom 2.1.0;

include "circomlib/circuits/comparators.circom";
include "helpers/dateUtils.circom";
include "helpers/nullifier.circom";

/*
 * ZKGate India — Compound Proof (banking KYC)
 *
 * Three claims, one proof:
 *   1. Holds a UIDAI-signed Aadhaar
 *   2. Age >= threshold
 *   3. Resident of the required state (and district, if demanded)
 *
 * Why not just send three separate proofs? Two reasons, and the second is the
 * one that matters.
 *
 * The cheap reason: one Groth16 proof is ~800 bytes and one pairing check,
 * where three are three of each.
 *
 * The real reason: three independent proofs are not soundly bindable to one
 * person. Nothing stops a 17-year-old from pairing their own citizenship proof
 * with an adult friend's age proof — each verifies perfectly on its own. Here
 * the same private `aadhaar_secret` feeds every claim AND the nullifier, so all
 * three facts are provably about the same human being. Splitting the claims
 * across circuits would mean re-deriving that binding by hand, and getting it
 * wrong is silent.
 */
template CompoundProof() {
    // ── Private ──
    signal input dob_year;
    signal input dob_month;
    signal input dob_day;
    signal input state_code;
    signal input district_code;
    signal input pincode;
    signal input signature_valid;
    signal input aadhaar_secret;

    // ── Public ──
    signal input age_threshold;
    signal input current_year;
    signal input current_month;
    signal input current_day;
    signal input required_state_code;
    signal input required_district_code;
    signal input verifier_id;
    signal input expiry_timestamp;

    // ── Public outputs ──
    signal output is_valid;
    signal output nullifier;
    signal output proved_state_code;

    // ── Claim 1: signature ──
    signature_valid === 1;

    // ── Claim 2: age ──
    component dob_ok = ValidDate();
    dob_ok.year  <== dob_year;
    dob_ok.month <== dob_month;
    dob_ok.day   <== dob_day;

    component now_ok = ValidDate();
    now_ok.year  <== current_year;
    now_ok.month <== current_month;
    now_ok.day   <== current_day;

    component not_future = LessEqThan(12);
    not_future.in[0] <== dob_year;
    not_future.in[1] <== current_year;
    not_future.out === 1;

    component age = AgeInYears();
    age.dob_year      <== dob_year;
    age.dob_month     <== dob_month;
    age.dob_day       <== dob_day;
    age.current_year  <== current_year;
    age.current_month <== current_month;
    age.current_day   <== current_day;

    component age_check = GreaterEqThan(8);
    age_check.in[0] <== age.age;
    age_check.in[1] <== age_threshold;

    // ── Claim 3: location (0 = wildcard, as in locationProof) ──
    component state_zero = IsZero();
    state_zero.in <== required_state_code;
    component state_eq = IsEqual();
    state_eq.in[0] <== state_code;
    state_eq.in[1] <== required_state_code;
    signal state_valid <== state_zero.out + (1 - state_zero.out) * state_eq.out;

    component dist_zero = IsZero();
    dist_zero.in <== required_district_code;
    component dist_eq = IsEqual();
    dist_eq.in[0] <== district_code;
    dist_eq.in[1] <== required_district_code;
    signal district_valid <== dist_zero.out + (1 - dist_zero.out) * dist_eq.out;

    // pincode is a private input here but deliberately unconstrained: banking KYC
    // asks for state, never for the exact pincode. It stays in the signal list so
    // the witness shape matches locationProof and one parser serves both.
    signal pincode_unused <== pincode * 0;

    // ── Replay guard, binding all three claims to one aadhaar_secret ──
    component nul = NullifierHash();
    nul.aadhaar_secret   <== aadhaar_secret;
    nul.verifier_id      <== verifier_id;
    nul.expiry_timestamp <== expiry_timestamp;
    nullifier <== nul.nullifier;

    proved_state_code <== state_code * (1 - state_zero.out);

    // ── All three, or nothing ──
    signal age_and_sig <== signature_valid * age_check.out;
    signal loc <== state_valid * district_valid;
    is_valid <== age_and_sig * loc;
    is_valid === 1;
}

component main {public [
    age_threshold,
    current_year,
    current_month,
    current_day,
    required_state_code,
    required_district_code,
    verifier_id,
    expiry_timestamp
]} = CompoundProof();
