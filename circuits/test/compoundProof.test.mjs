import { test } from "node:test";
import assert from "node:assert/strict";
import { prove, expectUnprovable, SECRET, today, session, LAYOUT } from "./helpers.mjs";

const KYC = "compound_proof";
const CIT = "citizenship_proof";
const PAN = "pan_proof";

const madhan = {
  dob_year: 1998, dob_month: 7, dob_day: 10,
  state_code: 28, district_code: 2865171, pincode: 517001,
  signature_valid: 1, aadhaar_secret: SECRET,
};

const bankKyc = {
  ...today, ...session,
  age_threshold: 18,
  required_state_code: 28,
  required_district_code: 0,
};

test("compound KYC: citizen + 18+ + AP resident in a single proof", async () => {
  const { verified, signals, publicSignals } = await prove(KYC, { ...madhan, ...bankKyc });

  assert.equal(verified, true);
  assert.equal(signals.is_valid, "1");
  assert.equal(signals.proved_state_code, "28");
  assert.equal(publicSignals.length, LAYOUT[KYC].n_public);

  // Everything the bank actually needed, and not one field more.
  assert.ok(!publicSignals.includes("1998"), "DOB leaked");
  assert.ok(!publicSignals.includes("517001"), "pincode leaked");
});

test("compound KYC fails if ANY single claim fails", async () => {
  // Right state, but underage.
  await expectUnprovable(KYC, {
    ...madhan, dob_year: 2015, dob_month: 1, dob_day: 1, ...bankKyc,
  });

  // Right age, but wrong state.
  await expectUnprovable(KYC, {
    ...madhan, state_code: 27, district_code: 2794402, ...bankKyc,
  });

  // Both fine, but the Aadhaar was never signed by UIDAI.
  await expectUnprovable(KYC, { ...madhan, signature_valid: 0, ...bankKyc });
});

test("compound binds every claim to ONE citizen", async () => {
  // This is the property that three separate proofs cannot give you. All three
  // claims and the nullifier are derived from the same private aadhaar_secret,
  // so a minor cannot bolt an adult's age proof onto their own citizenship proof
  // and present the pair. Changing the secret changes the nullifier, which the
  // registry sees.
  const a = await prove(KYC, { ...madhan, ...bankKyc });
  const b = await prove(KYC, {
    ...madhan, aadhaar_secret: "111122223333444455556666777788889999", ...bankKyc,
  });
  assert.notEqual(a.signals.nullifier, b.signals.nullifier);
});

test("compound with district demanded", async () => {
  const { verified } = await prove(KYC, {
    ...madhan, ...bankKyc, required_district_code: 2865171,
  });
  assert.equal(verified, true);

  await expectUnprovable(KYC, {
    ...madhan, ...bankKyc, required_district_code: 99999,
  });
});

test("citizenship: proves Aadhaar possession and literally nothing else", async () => {
  const { verified, signals, publicSignals } = await prove(CIT, {
    signature_valid: 1, aadhaar_secret: SECRET, ...session,
  });

  assert.equal(verified, true);
  assert.equal(signals.is_valid, "1");
  assert.equal(publicSignals.length, LAYOUT[CIT].n_public);

  // Four signals total: is_valid, nullifier, and the two the verifier supplied.
  // There is no room in this proof for a fact about the citizen to hide in.
  assert.deepEqual(
    publicSignals.slice(2),
    [String(session.verifier_id), String(session.expiry_timestamp)],
  );
});

test("citizenship cannot be forged without a signed Aadhaar", async () => {
  await expectUnprovable(CIT, {
    signature_valid: 0, aadhaar_secret: SECRET, ...session,
  });
});

test("PAN: pseudonym is stable per verifier and unlinkable across them", async () => {
  const panHash = "1340746360993847562019384756201938475620193847562019";

  const bank = await prove(PAN, {
    pan_hash: panHash, pan_linked: 1, signature_valid: 1,
    aadhaar_secret: SECRET, ...session,
  });
  assert.equal(bank.verified, true);

  // Same PAN, same verifier, later session => same pseudonym. The bank can spot
  // a returning PAN holder without ever learning the PAN.
  const bankLater = await prove(PAN, {
    pan_hash: panHash, pan_linked: 1, signature_valid: 1,
    aadhaar_secret: SECRET, verifier_id: session.verifier_id,
    expiry_timestamp: session.expiry_timestamp + 86400,
  });
  assert.equal(bankLater.signals.pan_pseudonym, bank.signals.pan_pseudonym);

  // Same PAN, a DIFFERENT verifier => a different pseudonym. Two verifiers who
  // pool their databases cannot join on it, which is exactly what handing over
  // the raw PAN would let them do today.
  const taxPortal = await prove(PAN, {
    pan_hash: panHash, pan_linked: 1, signature_valid: 1,
    aadhaar_secret: SECRET, verifier_id: 5555, expiry_timestamp: session.expiry_timestamp,
  });
  assert.notEqual(taxPortal.signals.pan_pseudonym, bank.signals.pan_pseudonym);

  // And the PAN commitment itself is nowhere in the bundle.
  assert.ok(!bank.publicSignals.includes(panHash), "PAN commitment leaked");
});

test("PAN: an empty commitment is not a PAN", async () => {
  await expectUnprovable(PAN, {
    pan_hash: 0, pan_linked: 1, signature_valid: 1, aadhaar_secret: SECRET, ...session,
  });
});

test("PAN: unlinked PAN is rejected", async () => {
  await expectUnprovable(PAN, {
    pan_hash: "1340746360993847562019384756201938475620193847562019",
    pan_linked: 0, signature_valid: 1, aadhaar_secret: SECRET, ...session,
  });
});
