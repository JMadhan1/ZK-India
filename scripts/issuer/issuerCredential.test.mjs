import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";
import {
  loadOrCreateIssuerKey,
  issuerPublicKey,
  issueAgeCredential,
  verifyAgeCredentialOffCircuit,
  issueCitizenshipCredential,
  issueLocationCredential,
  issueCompoundCredential,
  issuePanCredential,
  verifyCredentialOffCircuit,
} from "./issue_credential.mjs";

/*
 * These tests exercise the JS/crypto half of the issuer-credential upgrade
 * (docs/UIDAI_INTEGRATION.md) directly with circomlibjs, WITHOUT the circom
 * compiler — this environment does not have one installed. They verify the
 * same EdDSA-Poseidon check that circuits/src/helpers/issuerCredential.circom
 * performs in-circuit; they do not substitute for compiling and testing the
 * actual .circom file, which still needs to happen on a machine with circom
 * 2.x (see scripts/run_tests.sh and the repository README).
 */

const KEYFILE = path.join(tmpdir(), `zkgate-test-issuer-${process.pid}.json`);

test("issuer key round-trips and signs a verifiable credential", async () => {
  const prvKey = loadOrCreateIssuerKey(KEYFILE);
  const pub = await issuerPublicKey(prvKey);
  assert.ok(pub.pubkeyAx && pub.pubkeyAy);

  const attrs = { dob_year: 2000, dob_month: 5, dob_day: 14, secret: 123456789n };
  const cred = await issueAgeCredential(prvKey, attrs);

  assert.equal(cred.pubkeyAx, pub.pubkeyAx);
  assert.equal(cred.pubkeyAy, pub.pubkeyAy);

  const ok = await verifyAgeCredentialOffCircuit(cred, attrs);
  assert.equal(ok, true, "a genuine credential must verify");

  rmSync(KEYFILE, { force: true });
});

test("a credential does not verify against tampered attributes", async () => {
  const prvKey = loadOrCreateIssuerKey(KEYFILE);
  const attrs = { dob_year: 2000, dob_month: 5, dob_day: 14, secret: 123456789n };
  const cred = await issueAgeCredential(prvKey, attrs);

  const tampered = { ...attrs, dob_year: 2008 }; // citizen tries to age themself down
  const ok = await verifyAgeCredentialOffCircuit(cred, tampered);
  assert.equal(ok, false, "changing an attested attribute must break the signature check");

  rmSync(KEYFILE, { force: true });
});

test("a credential from a different (unregistered) issuer key does not verify", async () => {
  const prvKeyA = loadOrCreateIssuerKey(KEYFILE);
  const attrs = { dob_year: 2000, dob_month: 5, dob_day: 14, secret: 123456789n };
  const cred = await issueAgeCredential(prvKeyA, attrs);

  // Simulate a different, unregistered issuer's key by mutating the public
  // key attached to a genuine credential from issuer A.
  const forged = { ...cred, pubkeyAx: "1", pubkeyAy: "2" };
  const ok = await verifyAgeCredentialOffCircuit(forged, attrs);
  assert.equal(ok, false, "a credential must not verify against a key that didn't sign it");

  rmSync(KEYFILE, { force: true });
});

test("citizenship credential: secret-only commitment verifies, and rejects a different secret", async () => {
  const prvKey = loadOrCreateIssuerKey(KEYFILE);
  const secret = 123456789n;
  const cred = await issueCitizenshipCredential(prvKey, { secret });

  assert.equal(await verifyCredentialOffCircuit(cred, [], secret), true);
  assert.equal(
    await verifyCredentialOffCircuit(cred, [], 999999999n), false,
    "a credential for one secret must not verify for another",
  );

  rmSync(KEYFILE, { force: true });
});

test("location credential binds state/district/pincode — tampering any one breaks it", async () => {
  const prvKey = loadOrCreateIssuerKey(KEYFILE);
  const secret = 123456789n;
  const real = { state_code: 28, district_code: 2865171, pincode: 517001, secret };
  const cred = await issueLocationCredential(prvKey, real);

  assert.equal(
    await verifyCredentialOffCircuit(cred, [real.state_code, real.district_code, real.pincode], secret),
    true,
  );
  // The specific attack Day 3 of EXECUTION_PLAN.md calls out: a genuine
  // signature over AP (28) must not verify if replayed against Maharashtra (27).
  assert.equal(
    await verifyCredentialOffCircuit(cred, [27, real.district_code, real.pincode], secret),
    false, "a tampered state must fail even with an otherwise-genuine signature",
  );
  assert.equal(
    await verifyCredentialOffCircuit(cred, [real.state_code, 9999999, real.pincode], secret),
    false, "a tampered district must fail even with an otherwise-genuine signature",
  );
  assert.equal(
    await verifyCredentialOffCircuit(cred, [real.state_code, real.district_code, 999999], secret),
    false, "a tampered pincode must fail even with an otherwise-genuine signature",
  );

  rmSync(KEYFILE, { force: true });
});

test("compound credential binds dob+state+district together", async () => {
  const prvKey = loadOrCreateIssuerKey(KEYFILE);
  const secret = 123456789n;
  const real = { dob_year: 1998, dob_month: 7, dob_day: 10, state_code: 28, district_code: 2865171, secret };
  const cred = await issueCompoundCredential(prvKey, real);
  const attrs = [real.dob_year, real.dob_month, real.dob_day, real.state_code, real.district_code];

  assert.equal(await verifyCredentialOffCircuit(cred, attrs, secret), true);
  assert.equal(
    await verifyCredentialOffCircuit(cred, [2015, 1, 1, real.state_code, real.district_code], secret),
    false, "a genuine credential for one DOB must not verify for a different (e.g. minor's) DOB",
  );

  rmSync(KEYFILE, { force: true });
});

test("PAN credential binds pan_hash — a genuine signature cannot be reused for a different PAN", async () => {
  const prvKey = loadOrCreateIssuerKey(KEYFILE);
  const secret = 123456789n;
  const panHash = "1340746360993847562019384756201938475620193847562019";
  const cred = await issuePanCredential(prvKey, { pan_hash: panHash, secret });

  assert.equal(await verifyCredentialOffCircuit(cred, [panHash], secret), true);
  assert.equal(
    await verifyCredentialOffCircuit(cred, ["999999999999999999999999999999999999999999999999999"], secret),
    false, "a credential for one PAN must not verify for a different PAN",
  );

  rmSync(KEYFILE, { force: true });
});
