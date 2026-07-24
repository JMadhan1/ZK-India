import { test } from "node:test";
import assert from "node:assert/strict";
import {
  prove, expectUnprovable, SECRET, today, session, LAYOUT,
  compoundCredFields, citizenshipCredFields, panCredFields, tamperSignature,
} from "./helpers.mjs";

const KYC = "compound_proof";
const CIT = "citizenship_proof";
const PAN = "pan_proof";

const madhanAttrs = {
  dob_year: 1998, dob_month: 7, dob_day: 10,
  state_code: 28, district_code: 2865171, pincode: 517001,
};
const madhan = {
  ...madhanAttrs,
  aadhaar_secret: SECRET,
  ...(await compoundCredFields(
    madhanAttrs.dob_year, madhanAttrs.dob_month, madhanAttrs.dob_day,
    madhanAttrs.state_code, madhanAttrs.district_code,
  )),
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
  // Right state, but underage — issue a genuine credential for the minor's
  // real DOB+state so it's the age check failing, not the signature check.
  const minorAttrs = { ...madhanAttrs, dob_year: 2015, dob_month: 1, dob_day: 1 };
  await expectUnprovable(KYC, {
    ...minorAttrs, aadhaar_secret: SECRET,
    ...(await compoundCredFields(
      minorAttrs.dob_year, minorAttrs.dob_month, minorAttrs.dob_day,
      minorAttrs.state_code, minorAttrs.district_code,
    )),
    ...bankKyc,
  });

  // Right age, but wrong state — same idea, genuine credential for Maharashtra.
  const mhAttrs = { ...madhanAttrs, state_code: 27, district_code: 2794402 };
  await expectUnprovable(KYC, {
    ...mhAttrs, aadhaar_secret: SECRET,
    ...(await compoundCredFields(
      mhAttrs.dob_year, mhAttrs.dob_month, mhAttrs.dob_day,
      mhAttrs.state_code, mhAttrs.district_code,
    )),
    ...bankKyc,
  });

  // Both fine, but no genuine issuer ever signed it.
  await expectUnprovable(KYC, { ...madhan, ...tamperSignature(madhan), ...bankKyc });
});

test("a genuine signature over a different state cannot be reused for this one", async () => {
  // Same attack as locationProof: hold a real credential for AP, then swap in
  // a different state while keeping the old signature.
  await expectUnprovable(KYC, {
    ...madhanAttrs, state_code: 27, district_code: 2794402,
    aadhaar_secret: SECRET,
    issuer_sig_r8x: madhan.issuer_sig_r8x, issuer_sig_r8y: madhan.issuer_sig_r8y, issuer_sig_s: madhan.issuer_sig_s,
    issuer_pubkey_ax: madhan.issuer_pubkey_ax, issuer_pubkey_ay: madhan.issuer_pubkey_ay,
    ...bankKyc, required_state_code: 27,
  });
});

test("compound binds every claim to ONE citizen", async () => {
  // This is the property that three separate proofs cannot give you. All three
  // claims and the nullifier are derived from the same private aadhaar_secret,
  // so a minor cannot bolt an adult's age proof onto their own citizenship proof
  // and present the pair. Changing the secret changes the nullifier, which the
  // registry sees.
  const a = await prove(KYC, { ...madhan, ...bankKyc });
  const otherSecret = "111122223333444455556666777788889999";
  const b = await prove(KYC, {
    ...madhan, aadhaar_secret: otherSecret,
    ...(await compoundCredFields(
      madhanAttrs.dob_year, madhanAttrs.dob_month, madhanAttrs.dob_day,
      madhanAttrs.state_code, madhanAttrs.district_code, otherSecret,
    )),
    ...bankKyc,
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
  const cred = await citizenshipCredFields();
  const { verified, signals, publicSignals } = await prove(CIT, {
    aadhaar_secret: SECRET, ...cred, ...session,
  });

  assert.equal(verified, true);
  assert.equal(signals.is_valid, "1");
  assert.equal(publicSignals.length, LAYOUT[CIT].n_public);

  // Public signals: is_valid, nullifier, then verifier_id/expiry/issuer pubkey —
  // there is no room in this proof for a fact about the citizen to hide in.
  assert.deepEqual(
    publicSignals.slice(2),
    [
      String(session.verifier_id), String(session.expiry_timestamp),
      cred.issuer_pubkey_ax, cred.issuer_pubkey_ay,
    ],
  );
});

test("citizenship cannot be forged without a genuine issuer signature", async () => {
  const cred = await citizenshipCredFields();
  await expectUnprovable(CIT, {
    aadhaar_secret: SECRET, ...tamperSignature(cred), ...session,
  });
});

test("PAN: pseudonym is stable per verifier and unlinkable across them", async () => {
  const panHash = "1340746360993847562019384756201938475620193847562019";
  const panCred = await panCredFields(panHash);

  const bank = await prove(PAN, {
    pan_hash: panHash, aadhaar_secret: SECRET, ...panCred, ...session,
  });
  assert.equal(bank.verified, true);

  // Same PAN, same verifier, later session => same pseudonym. The bank can spot
  // a returning PAN holder without ever learning the PAN.
  const bankLater = await prove(PAN, {
    pan_hash: panHash, aadhaar_secret: SECRET, ...panCred,
    verifier_id: session.verifier_id,
    expiry_timestamp: session.expiry_timestamp + 86400,
  });
  assert.equal(bankLater.signals.pan_pseudonym, bank.signals.pan_pseudonym);

  // Same PAN, a DIFFERENT verifier => a different pseudonym. Two verifiers who
  // pool their databases cannot join on it, which is exactly what handing over
  // the raw PAN would let them do today.
  const taxPortal = await prove(PAN, {
    pan_hash: panHash, aadhaar_secret: SECRET, ...panCred,
    verifier_id: 5555, expiry_timestamp: session.expiry_timestamp,
  });
  assert.notEqual(taxPortal.signals.pan_pseudonym, bank.signals.pan_pseudonym);

  // And the PAN commitment itself is nowhere in the bundle.
  assert.ok(!bank.publicSignals.includes(panHash), "PAN commitment leaked");
});

test("PAN: an empty commitment is not a PAN", async () => {
  const panCred = await panCredFields(0);
  await expectUnprovable(PAN, {
    pan_hash: 0, aadhaar_secret: SECRET, ...panCred, ...session,
  });
});

test("PAN: unlinked PAN is rejected — no issuer credential means no linkage attestation", async () => {
  // There is no separate pan_linked bit any more (see panProof.circom's header
  // note): a PAN with no genuine issuer signature over it IS the "unlinked"
  // case, so this is the same tampered-signature shape as the other circuits.
  const panHash = "1340746360993847562019384756201938475620193847562019";
  const panCred = await panCredFields(panHash);
  await expectUnprovable(PAN, {
    pan_hash: panHash, aadhaar_secret: SECRET, ...tamperSignature(panCred), ...session,
  });
});

test("a genuine PAN signature cannot be reused for a different PAN hash", async () => {
  const panHash = "1340746360993847562019384756201938475620193847562019";
  const panCred = await panCredFields(panHash);
  await expectUnprovable(PAN, {
    pan_hash: "999999999999999999999999999999999999999999999999999", // different PAN
    aadhaar_secret: SECRET,
    issuer_sig_r8x: panCred.issuer_sig_r8x, issuer_sig_r8y: panCred.issuer_sig_r8y, issuer_sig_s: panCred.issuer_sig_s,
    issuer_pubkey_ax: panCred.issuer_pubkey_ax, issuer_pubkey_ay: panCred.issuer_pubkey_ay,
    ...session,
  });
});
