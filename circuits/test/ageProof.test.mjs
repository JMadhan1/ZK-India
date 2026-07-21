import { test } from "node:test";
import assert from "node:assert/strict";
import { prove, expectUnprovable, adult, today, session, LAYOUT } from "./helpers.mjs";

const AGE = "age_proof";

test("adult (28y) proves age >= 18", async () => {
  const { verified, signals, publicSignals } = await prove(AGE, {
    ...adult, ...today, ...session, age_threshold: 18,
  });

  assert.equal(verified, true);
  assert.equal(signals.is_valid, "1");
  assert.equal(publicSignals.length, LAYOUT[AGE].n_public);

  // The verifier's own parameters must come back untampered — this is what lets
  // the backend confirm the proof answers the question it actually asked.
  assert.equal(signals.age_threshold, "18");
  assert.equal(signals.verifier_id, String(session.verifier_id));
  assert.equal(signals.expiry_timestamp, String(session.expiry_timestamp));

  // The nullifier must be a real Poseidon output, not a passthrough of anything private.
  assert.ok(BigInt(signals.nullifier) > 0n);
  assert.notEqual(signals.nullifier, String(adult.dob_year));
});

test("the DOB never appears in the public signals", async () => {
  const { publicSignals } = await prove(AGE, {
    ...adult, ...today, ...session, age_threshold: 18,
  });

  // The whole promise of the product in one assertion: a verifier holding the
  // full proof bundle cannot read the citizen's date of birth out of it.
  const leaked = ["1998", "10071998", "19980710"];
  for (const v of leaked) {
    assert.ok(!publicSignals.includes(v), `DOB fragment ${v} leaked into public signals`);
  }
  // The exact age is not published either — only the threshold that was met.
  assert.ok(!publicSignals.includes("28"));
});

test("minor CANNOT produce an age >= 18 proof", async () => {
  await expectUnprovable(AGE, {
    dob_year: 2015, dob_month: 1, dob_day: 1,
    signature_valid: 1, aadhaar_secret: adult.aadhaar_secret,
    ...today, ...session, age_threshold: 18,
  });
});

test("birthday boundary: 17y364d cannot prove 18", async () => {
  // Born 2008-12-31, asked on 2026-07-14 => 17 years old, birthday not yet passed.
  // A `current_year - dob_year` implementation returns 18 here and lets a minor
  // through. This is the single most likely bug in an age circuit.
  await expectUnprovable(AGE, {
    dob_year: 2008, dob_month: 12, dob_day: 31,
    signature_valid: 1, aadhaar_secret: adult.aadhaar_secret,
    ...today, ...session, age_threshold: 18,
  });
});

test("birthday boundary: proof succeeds ON the birthday itself", async () => {
  const { verified, signals } = await prove(AGE, {
    dob_year: 2008, dob_month: 7, dob_day: 14, // turns 18 exactly today
    signature_valid: 1, aadhaar_secret: adult.aadhaar_secret,
    ...today, ...session, age_threshold: 18,
  });
  assert.equal(verified, true);
  assert.equal(signals.is_valid, "1");
});

test("birthday boundary: one day short of 18 fails", async () => {
  await expectUnprovable(AGE, {
    dob_year: 2008, dob_month: 7, dob_day: 15, // turns 18 tomorrow
    signature_valid: 1, aadhaar_secret: adult.aadhaar_secret,
    ...today, ...session, age_threshold: 18,
  });
});

test("an unsigned (forged) Aadhaar cannot produce a proof", async () => {
  await expectUnprovable(AGE, {
    ...adult, signature_valid: 0, ...today, ...session, age_threshold: 18,
  });
});

test("a future date of birth cannot produce a proof", async () => {
  // dob in the future makes (current_year - dob_year) negative. In a prime field
  // that is a huge positive number, which is exactly how you'd try to fool a
  // comparator built on Num2Bits. ValidDate + the not_future check close it.
  await expectUnprovable(AGE, {
    dob_year: 2030, dob_month: 1, dob_day: 1,
    signature_valid: 1, aadhaar_secret: adult.aadhaar_secret,
    ...today, ...session, age_threshold: 18,
  });
});

test("a nonsense month cannot produce a proof", async () => {
  await expectUnprovable(AGE, {
    dob_year: 1998, dob_month: 13, dob_day: 10,
    signature_valid: 1, aadhaar_secret: adult.aadhaar_secret,
    ...today, ...session, age_threshold: 18,
  });
});

test("28-year-old meets 21 but not 60", async () => {
  const ok = await prove(AGE, { ...adult, ...today, ...session, age_threshold: 21 });
  assert.equal(ok.verified, true);

  await expectUnprovable(AGE, { ...adult, ...today, ...session, age_threshold: 60 });
});

test("nullifier is stable per session and unlinkable across verifiers", async () => {
  const a = await prove(AGE, { ...adult, ...today, ...session, age_threshold: 18 });
  const again = await prove(AGE, { ...adult, ...today, ...session, age_threshold: 18 });

  // Same citizen, same verifier, same session => same nullifier. This is what
  // lets a verifier catch a replayed proof.
  assert.equal(a.signals.nullifier, again.signals.nullifier);

  // Same citizen, DIFFERENT verifier => different nullifier. This is what stops
  // two verifiers from joining their logs to track one citizen across services.
  const other = await prove(AGE, {
    ...adult, ...today, ...session, verifier_id: 12345, age_threshold: 18,
  });
  assert.notEqual(a.signals.nullifier, other.signals.nullifier);
});
