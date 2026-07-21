import * as snarkjs from "snarkjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export const adult = {
  dob_year: 1998,
  dob_month: 7,
  dob_day: 10,
  signature_valid: 1,
  aadhaar_secret: SECRET,
};

export const today = { current_year: 2026, current_month: 7, current_day: 14 };
export const session = { verifier_id: VERIFIER_ID, expiry_timestamp: EXPIRY };
