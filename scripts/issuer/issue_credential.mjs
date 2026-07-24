#!/usr/bin/env node
/**
 * ZKGate India — Issuer (enrolment authority) reference implementation.
 *
 * Stands in for a licensed AUA/KUA (a bank, telco, or Common Service Centre
 * already authorised by UIDAI to perform Aadhaar e-KYC). In production this
 * runs once per citizen, inside the issuer's own trusted enrolment flow,
 * AFTER it has verified the Aadhaar offline e-KYC XML's UIDAI signature the
 * ordinary way (the RSA-SHA256 XMLDSig check that sdk/src/aadhaar.js's
 * verifySignature() stops short of, by design — see docs/UIDAI_INTEGRATION.md).
 *
 * What it does: computes commitment = Poseidon(dob_year, dob_month, dob_day,
 * aadhaar_secret) and signs it with the issuer's own EdDSA (Baby Jubjub) key.
 * The resulting {r8x, r8y, s} plus the issuer's public key {pubkeyAx, pubkeyAy}
 * is the "issuer credential" that circuits/src/ageProof.circom now verifies
 * in-circuit, via circuits/src/helpers/issuerCredential.circom, in place of
 * the old client-asserted signature_valid bit.
 *
 * This closes the specific gap the project's own docs call "the single most
 * important gap": a citizen can no longer fabricate a date of birth and
 * self-assert validity — they must hold a genuine signature, from a
 * registered issuer key, over the exact attributes being proved. Trust now
 * rests on (a) the issuer having genuinely checked UIDAI's signature once at
 * enrolment, and (b) the issuer's key being genuinely restricted to
 * registered AUAs/KUAs (backend/services/issuer_registry.py). That is a
 * materially smaller trust surface than the stub, not a zero one.
 *
 * Usage (CLI):
 *   node scripts/issuer/issue_credential.mjs --dob-year 2000 --dob-month 5 \
 *        --dob-day 14 --secret 123456789 [--keyfile issuer_key.json]
 *
 * Usage (library):
 *   import { loadOrCreateIssuerKey, issueAgeCredential } from "./issue_credential.mjs";
 */

import { buildEddsa, buildPoseidon } from "circomlibjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

// fileURLToPath, not `new URL(...).pathname`: on Windows the latter yields a
// leading-slash path ("/C:/…/demo_issuer_key.json") that fs then re-roots to
// "C:\C:\…", breaking the e2e demo. fileURLToPath produces a native path.
const DEFAULT_KEYFILE = fileURLToPath(new URL("./demo_issuer_key.json", import.meta.url));

/**
 * Load a persisted demo issuer key, or generate and persist a fresh one.
 *
 * PROTOTYPE ONLY: a real issuer's private key must live in an HSM or a
 * KMS-backed keystore, never a JSON file on disk. This mirrors the same
 * "demo, not hidden" posture as the rest of the codebase — the file is named
 * demo_issuer_key.json and gitignored, not treated as production secret
 * material.
 */
export function loadOrCreateIssuerKey(keyfile = DEFAULT_KEYFILE) {
  if (existsSync(keyfile)) {
    const saved = JSON.parse(readFileSync(keyfile, "utf-8"));
    return Buffer.from(saved.privateKeyHex, "hex");
  }
  const prvKey = randomBytes(32);
  writeFileSync(keyfile, JSON.stringify({ privateKeyHex: prvKey.toString("hex") }, null, 2));
  return prvKey;
}

let _eddsa = null;
let _poseidon = null;
async function crypto_() {
  if (!_eddsa) _eddsa = await buildEddsa();
  if (!_poseidon) _poseidon = await buildPoseidon();
  return { eddsa: _eddsa, poseidon: _poseidon };
}

/** The issuer's public key, as decimal-string field elements (what the
 *  circuit and the backend registry both expect). */
export async function issuerPublicKey(prvKey) {
  const { eddsa } = await crypto_();
  const [ax, ay] = eddsa.prv2pub(prvKey);
  return {
    pubkeyAx: eddsa.F.toObject(ax).toString(),
    pubkeyAy: eddsa.F.toObject(ay).toString(),
  };
}

/**
 * Sign a citizen's age-proof attributes, producing the issuer credential the
 * SDK's buildWitness({ claimType: "age_above_*", ... }) requires.
 *
 * @param {Buffer} prvKey       issuer's EdDSA private key (32 bytes)
 * @param {object} attrs        { dob_year, dob_month, dob_day, secret }
 * @returns {Promise<{r8x, r8y, s, pubkeyAx, pubkeyAy, commitment}>}
 */
export async function issueAgeCredential(prvKey, { dob_year, dob_month, dob_day, secret }) {
  const { eddsa, poseidon } = await crypto_();
  const F = poseidon.F;

  const inputs = [BigInt(dob_year), BigInt(dob_month), BigInt(dob_day), BigInt(secret)];
  const commitment = poseidon(inputs); // circuit's internal (field) representation
  const sig = eddsa.signPoseidon(prvKey, commitment);
  const pub = eddsa.prv2pub(prvKey);

  return {
    r8x: eddsa.F.toObject(sig.R8[0]).toString(),
    r8y: eddsa.F.toObject(sig.R8[1]).toString(),
    s: sig.S.toString(),
    pubkeyAx: eddsa.F.toObject(pub[0]).toString(),
    pubkeyAy: eddsa.F.toObject(pub[1]).toString(),
    commitment: F.toObject(commitment).toString(),
  };
}

/**
 * Generic form of issueAgeCredential: sign Poseidon(...attrs, secret) with the
 * issuer's key. Every circuit besides age_proof uses this (via
 * IssuerCredentialCheckN / IssuerCredentialCheckSecretOnly in
 * circuits/src/helpers/issuerCredential.circom) instead of a fixed 4-input
 * commitment, since each claim binds a different set of attributes.
 *
 * @param {Buffer} prvKey
 * @param {(string|number|bigint)[]} attrs   attributes in the exact order the
 *   circuit's cred.attrs[i] expects, NOT including the secret
 * @param {string|number|bigint} secret      aadhaar_secret — always signed last
 * @returns {Promise<{r8x, r8y, s, pubkeyAx, pubkeyAy, commitment}>}
 */
export async function issueCredential(prvKey, attrs, secret) {
  const { eddsa, poseidon } = await crypto_();
  const F = poseidon.F;

  const inputs = [...attrs.map((a) => BigInt(a)), BigInt(secret)];
  const commitment = poseidon(inputs);
  const sig = eddsa.signPoseidon(prvKey, commitment);
  const pub = eddsa.prv2pub(prvKey);

  return {
    r8x: eddsa.F.toObject(sig.R8[0]).toString(),
    r8y: eddsa.F.toObject(sig.R8[1]).toString(),
    s: sig.S.toString(),
    pubkeyAx: eddsa.F.toObject(pub[0]).toString(),
    pubkeyAy: eddsa.F.toObject(pub[1]).toString(),
    commitment: F.toObject(commitment).toString(),
  };
}

/** citizenship_proof: commitment = Poseidon(secret) — no attributes besides
 *  the secret itself; see IssuerCredentialCheckSecretOnly(). */
export async function issueCitizenshipCredential(prvKey, { secret }) {
  return issueCredential(prvKey, [], secret);
}

/** location_proof: commitment = Poseidon(state_code, district_code, pincode,
 *  secret) — must match circuits/src/locationProof.circom's cred.attrs order
 *  exactly, or a genuinely-issued credential will fail the in-circuit check. */
export async function issueLocationCredential(prvKey, { state_code, district_code, pincode, secret }) {
  return issueCredential(prvKey, [state_code, district_code, pincode], secret);
}

/** compound_proof: commitment = Poseidon(dob_year, dob_month, dob_day,
 *  state_code, district_code, secret) — see compoundProof.circom's cred.attrs. */
export async function issueCompoundCredential(
  prvKey,
  { dob_year, dob_month, dob_day, state_code, district_code, secret },
) {
  return issueCredential(prvKey, [dob_year, dob_month, dob_day, state_code, district_code], secret);
}

/** pan_proof: commitment = Poseidon(pan_hash, secret) — the credential's mere
 *  existence IS the PAN-linkage attestation (see panProof.circom's header note). */
export async function issuePanCredential(prvKey, { pan_hash, secret }) {
  return issueCredential(prvKey, [pan_hash], secret);
}

/** Self-check: verify a credential the way the circuit's math effectively
 *  does, WITHOUT running circom — useful for tests and for this sandbox,
 *  which has no circom compiler installed. */
export async function verifyAgeCredentialOffCircuit(cred, { dob_year, dob_month, dob_day, secret }) {
  const { eddsa, poseidon } = await crypto_();
  const inputs = [BigInt(dob_year), BigInt(dob_month), BigInt(dob_day), BigInt(secret)];
  const commitment = poseidon(inputs);
  const sig = { R8: [eddsa.F.e(BigInt(cred.r8x)), eddsa.F.e(BigInt(cred.r8y))], S: BigInt(cred.s) };
  const pub = [eddsa.F.e(BigInt(cred.pubkeyAx)), eddsa.F.e(BigInt(cred.pubkeyAy))];
  return eddsa.verifyPoseidon(commitment, sig, pub);
}

/** Generic form of verifyAgeCredentialOffCircuit, for credentials produced by
 *  issueCredential()/issueCitizenshipCredential()/issueLocationCredential()/
 *  issueCompoundCredential()/issuePanCredential() — same attrs order caveat
 *  as issueCredential() itself. */
export async function verifyCredentialOffCircuit(cred, attrs, secret) {
  const { eddsa, poseidon } = await crypto_();
  const inputs = [...attrs.map((a) => BigInt(a)), BigInt(secret)];
  const commitment = poseidon(inputs);
  const sig = { R8: [eddsa.F.e(BigInt(cred.r8x)), eddsa.F.e(BigInt(cred.r8y))], S: BigInt(cred.s) };
  const pub = [eddsa.F.e(BigInt(cred.pubkeyAx)), eddsa.F.e(BigInt(cred.pubkeyAy))];
  return eddsa.verifyPoseidon(commitment, sig, pub);
}

// ── CLI ───────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i === -1 ? fallback : args[i + 1];
  };

  const dob_year = get("--dob-year");
  const dob_month = get("--dob-month");
  const dob_day = get("--dob-day");
  const secret = get("--secret");
  const keyfile = get("--keyfile", DEFAULT_KEYFILE);

  if (!dob_year || !dob_month || !dob_day || !secret) {
    console.error(
      "usage: issue_credential.mjs --dob-year Y --dob-month M --dob-day D --secret S [--keyfile path]",
    );
    process.exit(1);
  }

  const prvKey = loadOrCreateIssuerKey(keyfile);
  const cred = await issueAgeCredential(prvKey, { dob_year, dob_month, dob_day, secret });
  const ok = await verifyAgeCredentialOffCircuit(cred, { dob_year, dob_month, dob_day, secret });

  console.log(JSON.stringify({ ...cred, selfCheckPassed: ok }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
