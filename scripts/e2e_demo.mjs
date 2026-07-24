/**
 * End-to-end demo, no browser required.
 *
 * Walks the exact path a real citizen and verifier take:
 *   1. Parse a (synthetic) Aadhaar XML          — SDK, "on the citizen's device"
 *   2. Derive the secret and build a witness     — SDK
 *   3. Generate a Groth16 proof                  — snarkjs, locally
 *   4. POST it to the running backend            — the verifier
 *   5. Confirm the claim verifies
 *   6. POST the SAME proof again                 — confirm the replay is refused
 *   7. Present an 18-proof as a 21-claim         — confirm the semantic gate refuses it
 *
 * Prereq: the backend must be running (npm run dev:backend, or docker compose up).
 *
 *   node scripts/e2e_demo.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseAadhaarXml, deriveSecret, buildWitness, generateProof, verifySignature,
} from "@zkgate/sdk";
import { loadOrCreateIssuerKey, issueAgeCredential } from "./issuer/issue_credential.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const API = process.env.ZKGATE_API || "http://localhost:8000";
const KEYS = path.join(ROOT, "circuits", "keys");
const BUILD = path.join(ROOT, "circuits", "build");

const circuitFor = { age_proof: "ageProof", location_proof: "locationProof",
  citizenship_proof: "citizenshipProof", compound_proof: "compoundProof" };

function wasmZkey(snake) {
  return {
    wasmUrl: path.join(BUILD, circuitFor[snake], `${circuitFor[snake]}_js`, `${circuitFor[snake]}.wasm`),
    zkeyUrl: path.join(KEYS, `${snake}_final.zkey`),
  };
}

const c = (s, code) => `\x1b[${code}m${s}\x1b[0m`;
const ok = (s) => c("✓ " + s, "32");
const bad = (s) => c("✗ " + s, "31");
const step = (s) => console.log("\n" + c(s, "36;1"));

async function post(body) {
  const res = await fetch(`${API}/v1/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function main() {
  // Preflight: is the backend up?
  try {
    const h = await (await fetch(`${API}/health`)).json();
    console.log(`Backend: ${API} — ${h.status}, circuits: ${h.circuits_loaded?.join(", ")}`);
  } catch {
    console.error(bad(`Backend not reachable at ${API}. Start it: npm run dev:backend`));
    process.exit(1);
  }

  step("STEP 1 — Citizen parses their Aadhaar XML locally");
  const xml = fs.readFileSync(path.join(ROOT, "test-data", "sample_aadhaar.xml"), "utf8");
  const parsed = parseAadhaarXml(xml);
  console.log(`  Name (private): ${parsed.raw.name}, DOB (private): ${parsed.raw.dob}`);
  console.log(ok(`Parsed. State ${parsed.raw.stateName} => code ${parsed.fields.state_code}`));

  const sig = await verifySignature(xml, null);
  const secret = await deriveSecret(parsed.raw.referenceId);
  const verifierId = "99999";
  const expiry = Math.floor(Date.now() / 1000) + 3600;

  step("STEP 2-3 — Build witness and generate an age>=18 proof");
  // No circuit has a client-asserted signature_valid stub any more — the
  // witness needs a genuine issuer credential over the exact DOB being
  // proved (see docs/UIDAI_INTEGRATION.md).
  const issuerKey = loadOrCreateIssuerKey();
  const issuerCredential = await issueAgeCredential(issuerKey, {
    dob_year: parsed.fields.dob_year, dob_month: parsed.fields.dob_month,
    dob_day: parsed.fields.dob_day, secret,
  });
  const witness = buildWitness({
    claimType: "age_above_18", fields: parsed.fields, secret,
    request: { verifierId, expiry, ageThreshold: 18 }, issuerCredential,
  });
  const t0 = Date.now();
  const proofResult = await generateProof({ claimType: "age_above_18", witnessInput: witness, ...wasmZkey("age_proof") });
  console.log(ok(`Proof generated in ${Date.now() - t0}ms (${proofResult.publicSignals.length} public signals)`));
  console.log(`  Public signals contain no DOB: ${!proofResult.publicSignals.includes("1998") ? ok("confirmed") : bad("LEAK")}`);

  const bundle = (claim, expected) => ({
    proof_bundle: {
      proof: proofResult.proof, public_signals: proofResult.publicSignals,
      claim_type: claim, generated_at: proofResult.generatedAt, demo: sig.demo,
    },
    verifier_id: verifierId, expected,
  });

  step("STEP 4-5 — Verifier checks the proof");
  const r1 = await post(bundle("age_above_18", { age_threshold: 18 }));
  console.log(r1.valid ? ok(`VALID. Claims: ${JSON.stringify(r1.claims)}`) : bad(`unexpected: ${r1.error}`));
  console.log(`  Trust level: ${r1.trust_level} (demo XML => demo, as designed)`);

  step("STEP 6 — Same proof replayed → must be refused");
  const r2 = await post(bundle("age_above_18", { age_threshold: 18 }));
  console.log(!r2.valid && r2.fresh === false ? ok(`Replay refused: "${r2.error}"`) : bad("replay was NOT caught!"));

  step("STEP 7 — An 18-proof presented as a 21-claim → must be refused");
  const r3 = await post(bundle("age_above_21", { age_threshold: 21 }));
  console.log(!r3.valid ? ok(`Semantic gate refused it: "${r3.error}"`) : bad("off-topic proof was accepted!"));

  step("SUMMARY");
  const pass = r1.valid && !r2.valid && r2.fresh === false && !r3.valid;
  console.log(pass ? ok("End-to-end pipeline behaves correctly.") : bad("something is off — see above."));
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(bad(e.stack || e.message)); process.exit(1); });
