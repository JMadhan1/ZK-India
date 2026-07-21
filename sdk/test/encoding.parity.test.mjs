import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  encodeState, encodeDistrict, encodePincode, normalize, fnv1a32,
} from "../src/encoding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

/*
 * The point of this file: prove the JS encoder and the Python encoder agree.
 * We shell out to the Python side over a shared set of inputs and diff. If the
 * venv isn't present the test skips rather than fails — it is a cross-language
 * guard, not a reason to block a JS-only checkout.
 */

const PY = process.platform === "win32"
  ? path.join(ROOT, ".venv", "Scripts", "python.exe")
  : path.join(ROOT, ".venv", "bin", "python");

const STATES = [
  "Andhra Pradesh", "andhra   pradesh", "TAMILNADU", "Orissa", "NCT of Delhi",
  "Maharashtra", "West Bengal", "Jammu & Kashmir", "Atlantis", "",
];
const DISTRICTS = [
  ["Andhra Pradesh", "Chittoor"], ["Maharashtra", "Mumbai"],
  ["Delhi", "New Delhi"], ["Tamil Nadu", "Chennai"], ["Andhra Pradesh", "Visakhapatnam"],
];
const PINCODES = ["517001", "400001", "51700", "abc123", "110001"];

function pythonEncode() {
  const script = `
import json, sys
sys.path.insert(0, r"${path.join(ROOT, "backend").replace(/\\/g, "\\\\")}")
from services import encoding
states = ${JSON.stringify(STATES)}
districts = ${JSON.stringify(DISTRICTS)}
pincodes = ${JSON.stringify(PINCODES)}
out = {
  "states": {s: encoding.encode_state(s) for s in states},
  "districts": {f"{a}|{b}": encoding.encode_district(encoding.encode_state(a), b) for a,b in districts},
  "pincodes": {p: encoding.encode_pincode(p) for p in pincodes},
  "fnv": {s: encoding.fnv1a32(encoding.normalize(s)) for s in ["Chittoor","New Delhi","visakhapatnam"]},
}
print(json.dumps(out))
`;
  const raw = execFileSync(PY, ["-c", script], { encoding: "utf8" });
  return JSON.parse(raw);
}

test("JS and Python encoders agree on every input", { skip: skipIfNoPython() }, () => {
  const py = pythonEncode();

  for (const s of STATES) {
    assert.equal(encodeState(s), py.states[s], `state mismatch for ${JSON.stringify(s)}`);
  }
  for (const [a, b] of DISTRICTS) {
    assert.equal(
      encodeDistrict(encodeState(a), b), py.districts[`${a}|${b}`],
      `district mismatch for ${a}/${b}`,
    );
  }
  for (const p of PINCODES) {
    assert.equal(encodePincode(p), py.pincodes[p], `pincode mismatch for ${p}`);
  }
  for (const s of ["Chittoor", "New Delhi", "visakhapatnam"]) {
    assert.equal(fnv1a32(normalize(s)), py.fnv[s], `fnv mismatch for ${s}`);
  }
});

function skipIfNoPython() {
  try {
    execFileSync(PY, ["-c", "import py_ecc"], { stdio: "ignore" });
    return false;
  } catch {
    return "python venv not available; skipping cross-language parity";
  }
}
