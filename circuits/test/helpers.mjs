import * as snarkjs from "snarkjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  issueAgeCredential,
  issueCitizenshipCredential,
  issueLocationCredential,
  issueCompoundCredential,
  issuePanCredential,
} from "../../scripts/issuer/issue_credential.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CIRCUITS = path.resolve(HERE, "..");
export const KEYS = path.join(CIRCUITS, "keys");
export const BUILD = path.join(CIRCUITS, "build");

export const LAYOUT = JSON.parse(
  fs.readFileSync(path.join(KEYS, "signal_layout.json"), "utf8"),
).circuits;

// A stand-in for the secret the citizen portal derives from their Aadhaar XML.
export const SECRET =
  "8253619304059871053513128372613172819304857192837465019283746501928";

export const VERIFIER_ID = 99999;
export const EXPIRY = 1783699200;

// Fixed test-only issuer EdDSA key — deterministic so fixtures don't change
// between runs. Deliberately NOT scripts/issuer/demo_issuer_key.json (that
// file is gitignored/machine-generated); this one lives only in test memory,
// the same way fixtures.json's proofs are generated against a real key but
// don't need that key checked in.
export const TEST_ISSUER_PRVKEY = Buffer.from("11".repeat(32), "hex");

function paths(snake) {
  const circuit = LAYOUT[snake].circuit;
  return {
    wasm: path.join(BUILD, circuit, `${circuit}_js`, `${circuit}.wasm`),
    zkey: path.join(KEYS, `${snake}_final.zkey`),
    vkey: path.join(KEYS, `${snake}_verification_key.json`),
  };
}

/** Generate and verify a proof. Returns { proof, publicSignals, verified, signals }. */
export async function prove(snake, input) {
  const { wasm, zkey, vkey } = paths(snake);
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const verified = await snarkjs.groth16.verify(
    JSON.parse(fs.readFileSync(vkey, "utf8")),
    publicSignals,
    proof,
  );

  // Name the flat publicSignals array using the shared layout contract.
  const names = LAYOUT[snake].signals;
  const signals = Object.fromEntries(names.map((n, i) => [n, publicSignals[i]]));

  return { proof, publicSignals, verified, signals };
}

/**
 * Assert that a witness CANNOT be built.
 *
 * This is the assertion that carries the security of the whole system. Our
 * circuits constrain their claims rather than reporting them, so a false claim
 * has no satisfying witness and snarkjs throws during witness generation. If
 * this ever starts returning a proof instead of throwing, a citizen who fails
 * the check is getting a cryptographically valid proof of a false statement.
 */
export async function expectUnprovable(snake, input) {
  try {
    const { wasm, zkey } = paths(snake);
    await snarkjs.groth16.fullProve(input, wasm, zkey);
  } catch {
    return; // correct: no witness exists
  }
  throw new Error(
    `SECURITY: ${snake} produced a proof for input that must be unprovable: ` +
      JSON.stringify(input),
  );
}

/** { issuer_sig_r8x, issuer_sig_r8y, issuer_sig_s, issuer_pubkey_ax, issuer_pubkey_ay } from
 *  an issue*Credential() result — the shape every circuit's cred.* inputs expect. */
function credFields(cred) {
  return {
    issuer_sig_r8x: cred.r8x, issuer_sig_r8y: cred.r8y, issuer_sig_s: cred.s,
    issuer_pubkey_ax: cred.pubkeyAx, issuer_pubkey_ay: cred.pubkeyAy,
  };
}

/** Issue a genuine age_proof credential for EXACTLY the given dob, and return
 *  the witness-ready credential fields. Tests that vary dob_year/month/day
 *  must call this per variant — a credential is only valid for the attributes
 *  it actually commits to. */
export async function ageCredFields(dob_year, dob_month, dob_day, secret = SECRET) {
  const cred = await issueAgeCredential(TEST_ISSUER_PRVKEY, { dob_year, dob_month, dob_day, secret });
  return credFields(cred);
}

export async function citizenshipCredFields(secret = SECRET) {
  const cred = await issueCitizenshipCredential(TEST_ISSUER_PRVKEY, { secret });
  return credFields(cred);
}

export async function locationCredFields(state_code, district_code, pincode, secret = SECRET) {
  const cred = await issueLocationCredential(TEST_ISSUER_PRVKEY, { state_code, district_code, pincode, secret });
  return credFields(cred);
}

export async function compoundCredFields(dob_year, dob_month, dob_day, state_code, district_code, secret = SECRET) {
  const cred = await issueCompoundCredential(TEST_ISSUER_PRVKEY, {
    dob_year, dob_month, dob_day, state_code, district_code, secret,
  });
  return credFields(cred);
}

export async function panCredFields(pan_hash, secret = SECRET) {
  const cred = await issuePanCredential(TEST_ISSUER_PRVKEY, { pan_hash, secret });
  return credFields(cred);
}

/** Flip one digit of a genuine credential's signature — a stand-in for "no
 *  genuine issuer signature exists" (what signature_valid: 0 used to mean).
 *  The EdDSA check inside the IssuerCredentialCheck templates is a hard
 *  assert, so this must make the witness unprovable, not just wrong. */
export function tamperSignature(credFieldsObj) {
  return { ...credFieldsObj, issuer_sig_s: String(BigInt(credFieldsObj.issuer_sig_s) + 1n) };
}

export const adult = {
  dob_year: 1998,
  dob_month: 7,
  dob_day: 10,
  aadhaar_secret: SECRET,
  ...(await ageCredFields(1998, 7, 10)),
};

export const today = { current_year: 2026, current_month: 7, current_day: 14 };
export const session = { verifier_id: VERIFIER_ID, expiry_timestamp: EXPIRY };
