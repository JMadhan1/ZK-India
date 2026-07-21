import { test } from "node:test";
import assert from "node:assert/strict";
import { prove, expectUnprovable, SECRET, session, LAYOUT } from "./helpers.mjs";

const LOC = "location_proof";

// Madhan Kumar: Chittoor, Andhra Pradesh (census state code 28), pincode 517001.
const ap = {
  state_code: 28,
  district_code: 2865171,
  pincode: 517001,
  signature_valid: 1,
  aadhaar_secret: SECRET,
};

const ANY = { required_state_code: 0, required_district_code: 0, required_pincode: 0 };

test("proves Andhra Pradesh residency at state granularity", async () => {
  const { verified, signals, publicSignals } = await prove(LOC, {
    ...ap, ...session, ...ANY, required_state_code: 28, proof_level: 2,
  });

  assert.equal(verified, true);
  assert.equal(signals.is_valid, "1");
  assert.equal(signals.proved_state_code, "28");
  assert.equal(publicSignals.length, LAYOUT[LOC].n_public);
});

test("the street address never reaches the public signals", async () => {
  const { publicSignals } = await prove(LOC, {
    ...ap, ...session, ...ANY, required_state_code: 28, proof_level: 2,
  });

  // The verifier learns "Andhra Pradesh" and nothing narrower. Pincode and
  // district were in the witness but were not demanded, so they stay private.
  assert.ok(!publicSignals.includes("517001"), "pincode leaked");
  assert.ok(!publicSignals.includes("2865171"), "district leaked");
});

test("a Maharashtra resident CANNOT prove AP residency", async () => {
  await expectUnprovable(LOC, {
    state_code: 27, district_code: 2794402, pincode: 400001,
    signature_valid: 1, aadhaar_secret: SECRET,
    ...session, ...ANY, required_state_code: 28, proof_level: 2,
  });
});

test("proof_level cannot overstate what was actually checked", async () => {
  // Claiming level 4 ("pincode verified") while leaving required_pincode at the
  // 0 wildcard would hand the verifier a proof that checked no pincode at all
  // but is labelled as though it had. The circuit refuses to build it.
  await expectUnprovable(LOC, {
    ...ap, ...session,
    required_state_code: 28, required_district_code: 2865171, required_pincode: 0,
    proof_level: 4,
  });

  // Same trick one rung down: level 3 with no district demanded.
  await expectUnprovable(LOC, {
    ...ap, ...session,
    required_state_code: 28, required_district_code: 0, required_pincode: 0,
    proof_level: 3,
  });
});

test("level 4 works when the pincode really is checked", async () => {
  const { verified, signals } = await prove(LOC, {
    ...ap, ...session,
    required_state_code: 28, required_district_code: 2865171, required_pincode: 517001,
    proof_level: 4,
  });
  assert.equal(verified, true);
  assert.equal(signals.required_pincode, "517001");
});

test("wrong pincode in the same district is rejected", async () => {
  await expectUnprovable(LOC, {
    ...ap, ...session,
    required_state_code: 28, required_district_code: 2865171, required_pincode: 517002,
    proof_level: 4,
  });
});

test("level 1 (country only) reveals no state at all", async () => {
  const { verified, signals, publicSignals } = await prove(LOC, {
    ...ap, ...session, ...ANY, proof_level: 1,
  });

  assert.equal(verified, true);
  // Nobody asked for a state, so none is published — not even the true one.
  assert.equal(signals.proved_state_code, "0");
  assert.ok(!publicSignals.includes("28"), "state leaked on a country-only proof");
});

test("proof_level outside 1..4 is rejected", async () => {
  await expectUnprovable(LOC, {
    ...ap, ...session, ...ANY, required_state_code: 28, proof_level: 0,
  });
  await expectUnprovable(LOC, {
    ...ap, ...session, ...ANY, required_state_code: 28, proof_level: 5,
  });
});

test("an unsigned Aadhaar cannot produce a location proof", async () => {
  await expectUnprovable(LOC, {
    ...ap, signature_valid: 0, ...session, ...ANY, required_state_code: 28, proof_level: 2,
  });
});
