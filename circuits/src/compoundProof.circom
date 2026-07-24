pragma circom 2.1.0;

include "circomlib/circuits/comparators.circom";
include "helpers/dateUtils.circom";
include "helpers/nullifier.circom";
include "helpers/issuerCredential.circom";

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
 *
 * On the issuer credential (replaces the old signature_valid stub):
 *
 *   The commitment the issuer signs covers dob_year/dob_month/dob_day AND
 *   state_code/district_code, alongside the secret — see
 *   helpers/issuerCredential.circom's IssuerCredentialCheckN(5). Binding all
 *   five preserves the "provably one person" property this circuit exists
 *   for: it is not enough that SOME attributes were genuinely attested, it
 *   must be THESE age and location attributes, together, under one
 *   signature, or a citizen could mix a genuinely-attested DOB with a
 *   self-chosen state. pincode is deliberately left out of the commitment,
 *   same as it's left unconstrained below — banking KYC here never asks for
 *   pincode precision, so there is nothing to attest about it.
 */
template CompoundProof() {
    // ── Private ──
    signal input dob_year;
    signal input dob_month;
    signal input dob_day;
    signal input state_code;
    signal input district_code;
    signal input pincode;
    signal input aadhaar_secret;
    signal input issuer_sig_r8x;
    signal input issuer_sig_r8y;
    signal input issuer_sig_s;

    // ── Public ──
    signal input age_threshold;
    signal input current_year;
    signal input current_month;
    signal input current_day;
    signal input required_state_code;
    signal input required_district_code;
    signal input verifier_id;
    signal input expiry_timestamp;
    signal input issuer_pubkey_ax;
    signal input issuer_pubkey_ay;

    // ── Public outputs ──
    signal output is_valid;
    signal output nullifier;
    signal output proved_state_code;

    // ── Claim 1: a genuine issuer credential over (dob, state, district, secret) ──
    component cred = IssuerCredentialCheckN(5);
    cred.attrs[0]          <== dob_year;
    cred.attrs[1]          <== dob_month;
    cred.attrs[2]          <== dob_day;
    cred.attrs[3]          <== state_code;
    cred.attrs[4]          <== district_code;
    cred.aadhaar_secret    <== aadhaar_secret;
    cred.issuer_sig_r8x    <== issuer_sig_r8x;
    cred.issuer_sig_r8y    <== issuer_sig_r8y;
    cred.issuer_sig_s      <== issuer_sig_s;
    cred.issuer_pubkey_ax  <== issuer_pubkey_ax;
    cred.issuer_pubkey_ay  <== issuer_pubkey_ay;

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

    // ── All three, or nothing. The signature factor is gone: the issuer
    //    credential check above is already a hard assertion, so only the age
    //    and location comparisons remain to route through is_valid. ──
    signal loc <== state_valid * district_valid;
    is_valid <== age_check.out * loc;
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
    expiry_timestamp,
    issuer_pubkey_ax,
    issuer_pubkey_ay
]} = CompoundProof();
