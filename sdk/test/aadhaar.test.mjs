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

  const age = buildWitness({ claimType: "age_above_18", fields: parsed.fields, secret, request });
  assert.equal(age.age_threshold, 18);
  assert.equal(age.signature_valid, 1);
  assert.ok(!("state_code" in age), "age witness must not carry address fields");

  const loc = buildWitness({
    claimType: "state_resident", fields: parsed.fields, secret,
    request: { ...request, requiredStateCode: 28, proofLevel: 2 },
  });
  assert.equal(loc.required_state_code, 28);
  assert.ok(!("dob_year" in loc), "location witness must not carry the DOB");
});
