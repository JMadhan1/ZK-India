import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAadhaarXml, parseDob, verifySignature } from "../src/aadhaar.js";
import { deriveSecret, buildWitness } from "../src/prover.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = fs.readFileSync(
  path.resolve(HERE, "../../test-data/sample_aadhaar.xml"), "utf8",
);

test("parses the sample Aadhaar XML into circuit fields", () => {
  const parsed = parseAadhaarXml(SAMPLE);
  assert.equal(parsed.raw.name, "Madhan Kumar");
  assert.equal(parsed.fields.dob_year, 1998);
  assert.equal(parsed.fields.dob_month, 7);
  assert.equal(parsed.fields.dob_day, 10);
  assert.equal(parsed.fields.state_code, 28); // Andhra Pradesh
  assert.equal(parsed.fields.pincode, 517001);
  assert.ok(parsed.fields.district_code > 0);
});

test("parseDob handles DD-MM-YYYY and rejects nonsense", () => {
  assert.deepEqual(parseDob("10-07-1998"), { day: 10, month: 7, year: 1998 });
  assert.deepEqual(parseDob("1998-07-10"), { day: 10, month: 7, year: 1998 });
  assert.throws(() => parseDob("32-13-1998"));
  assert.throws(() => parseDob(""));
});

test("rejects a non-Aadhaar document", () => {
  assert.throws(() => parseAadhaarXml("<html>not aadhaar</html>"));
});

test("demo-mode signature check is honest about being demo", async () => {
  const res = await verifySignature(SAMPLE, null);
  assert.equal(res.valid, true);
  assert.equal(res.demo, true);
});

test("real signature verification refuses to fake it", async () => {
  // Passing a key must not silently 'pass' — the prototype has no real impl,
  // and it says so rather than pretending.
  await assert.rejects(() => verifySignature(SAMPLE, {}), /not implemented/);
});

test("secret derivation is deterministic and unlinkable", async () => {
  const s1 = await deriveSecret("xxxx1234567890");
  const s2 = await deriveSecret("xxxx1234567890");
  const s3 = await deriveSecret("xxxx9999999999");
  assert.equal(s1, s2, "same referenceId must give the same secret");
  assert.notEqual(s1, s3, "different referenceId must give a different secret");
});

test("buildWitness produces the right shape per claim", async () => {
  const parsed = parseAadhaarXml(SAMPLE);
  const secret = await deriveSecret(parsed.raw.referenceId);
  const request = { verifierId: "99999", expiry: 1783699200, ageThreshold: 18 };

  // No circuit takes signature_valid any more — every claim requires a real
  // issuer credential (see docs/UIDAI_INTEGRATION.md and
  // issuerCredential.test.mjs). The exact commitment inputs differ per claim
  // but buildWitness doesn't need to know that — it just carries the
  // signature fields through.
  const issuerCredential = {
    r8x: "1", r8y: "2", s: "3", pubkeyAx: "4", pubkeyAy: "5",
  };
  const age = buildWitness({
    claimType: "age_above_18", fields: parsed.fields, secret, request, issuerCredential,
  });
  assert.equal(age.age_threshold, 18);
  assert.equal(age.issuer_pubkey_ax, "4");
  assert.equal(age.issuer_sig_s, "3");
  assert.ok(!("signature_valid" in age), "age witness no longer uses the signature_valid stub");
  assert.ok(!("state_code" in age), "age witness must not carry address fields");

  const loc = buildWitness({
    claimType: "state_resident", fields: parsed.fields, secret,
    request: { ...request, requiredStateCode: 28, proofLevel: 2 }, issuerCredential,
  });
  assert.equal(loc.required_state_code, 28);
  assert.equal(loc.issuer_pubkey_ax, "4");
  assert.ok(!("signature_valid" in loc), "location witness no longer uses the signature_valid stub");
  assert.ok(!("dob_year" in loc), "location witness must not carry the DOB");

  const citizen = buildWitness({
    claimType: "india_citizen", fields: parsed.fields, secret, request, issuerCredential,
  });
  assert.ok(!("signature_valid" in citizen));
  assert.ok(!("dob_year" in citizen) && !("state_code" in citizen));

  const kyc = buildWitness({
    claimType: "compound_kyc", fields: parsed.fields, secret,
    request: { ...request, requiredStateCode: 28 }, issuerCredential,
  });
  assert.ok(!("signature_valid" in kyc));
  assert.equal(kyc.state_code, parsed.fields.state_code);

  const pan = buildWitness({
    claimType: "pan_holder", fields: parsed.fields, secret,
    request: { ...request, panHash: "123456789" }, issuerCredential,
  });
  assert.equal(pan.pan_hash, "123456789");
  assert.ok(!("signature_valid" in pan), "pan witness no longer uses the signature_valid stub");
  assert.ok(!("pan_linked" in pan), "pan witness no longer self-asserts pan_linked");
});

test("every claim type refuses to build without an issuer credential", async () => {
  const parsed = parseAadhaarXml(SAMPLE);
  const secret = await deriveSecret(parsed.raw.referenceId);
  const request = { verifierId: "99999", expiry: 1783699200, ageThreshold: 18 };
  for (const claimType of ["age_above_18", "state_resident", "india_citizen", "compound_kyc", "pan_holder"]) {
    assert.throws(
      () => buildWitness({ claimType, fields: parsed.fields, secret, request }),
      /requires issuerCredential/,
      `${claimType} should require an issuer credential`,
    );
  }
});
