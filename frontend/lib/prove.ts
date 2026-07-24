"use client";

// Browser-side proof pipeline. Everything here runs on the citizen's device;
// nothing in this file makes a network call except fetching the PUBLIC circuit
// artifacts (wasm + proving key) that ship as static assets.

import {
  parseAadhaarXml,
  deriveSecret,
  buildWitness,
  generateProof,
  verifySignature,
} from "@zkgate/sdk";
import { buildEddsa, buildPoseidon } from "circomlibjs";

// ── DEMO issuer key ──────────────────────────────────────────────────────
//
// No circuit in this repo has a client-asserted signature_valid stub any
// more (see docs/UIDAI_INTEGRATION.md) — every claim requires a genuine
// EdDSA issuer credential. In production that credential is issued ONCE, by
// a licensed AUA/KUA, at enrolment time (scripts/issuer/issue_credential.mjs
// is the reference implementation), and the citizen's wallet simply holds
// and replays it — the private key never touches this file.
//
// This demo has no enrolment step or issuer backend, so it signs locally
// with a hardcoded, publicly-known demo key, purely to keep the browser demo
// working end to end. This is exactly as trustworthy as the old
// signature_valid=1 stub was — i.e. not at all — and is honestly reported as
// such: this key is never registered in backend/services/issuer_registry.py,
// so every proof produced here resolves to trust_level "demo", the same as
// before. A real deployment must replace this with a call to a real issuer
// service; the private key must never live in browser code.
const DEMO_ISSUER_PRVKEY_HEX =
  "44454d4f2d4f4e4c592d4b45592d4e4f542d464f522d50524f44554354494f4e21";

async function demoIssuerCredential(claimType: string, fields: ParsedAadhaar["fields"], secret: bigint | string) {
  const eddsa = await buildEddsa();
  const poseidon = await buildPoseidon();
  const prvKey = Buffer.from(DEMO_ISSUER_PRVKEY_HEX, "hex");

  // Commitment inputs must match the exact per-circuit shape the circuit
  // itself signs over — see circuits/src/helpers/issuerCredential.circom.
  let attrs: (string | number)[];
  if (claimType.startsWith("age_above")) {
    attrs = [fields.dob_year, fields.dob_month, fields.dob_day];
  } else if (claimType === "state_resident" || claimType === "district_resident") {
    attrs = [fields.state_code, fields.district_code, fields.pincode];
  } else if (claimType === "india_citizen") {
    attrs = [];
  } else if (claimType === "compound_kyc") {
    attrs = [fields.dob_year, fields.dob_month, fields.dob_day, fields.state_code, fields.district_code];
  } else {
    throw new Error(`no demo issuer commitment defined for claim type: ${claimType}`);
  }

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
  };
}

export type ParsedAadhaar = ReturnType<typeof parseAadhaarXml>;

export type ProofResult = {
  proof: unknown;
  publicSignals: string[];
  claimType: string;
  circuit: string;
  generatedAt: number;
  demo: boolean;
};

// A generous default session window for the demo. In production the verifier
// sets this tightly via their proof request.
const DEMO_TTL_SECONDS = 3600;

export async function parse(xml: string): Promise<ParsedAadhaar> {
  return parseAadhaarXml(xml);
}

/**
 * Build a proof for a claim, in the browser.
 *
 * `circuit` is the snake_case artifact base name (e.g. "age_proof"); the wasm
 * and zkey are served from /circuits/<circuit>.{wasm,zkey}.
 */
export async function prove(opts: {
  xml: string;
  parsed: ParsedAadhaar;
  claimType: string;
  circuit: string;
  verifierId: string;
  requiredStateCode?: number;
  ageThreshold?: number;
}): Promise<ProofResult> {
  const { xml, parsed, claimType, circuit, verifierId } = opts;

  // The demo XMLs carry no real UIDAI signature; verifySignature says so and we
  // propagate that honestly into the bundle's `demo` flag.
  const sig = await verifySignature(xml, null);
  const secret = await deriveSecret(parsed.raw.referenceId);

  const expiry = Math.floor(Date.now() / 1000) + DEMO_TTL_SECONDS;
  const request = {
    verifierId,
    expiry,
    ageThreshold: opts.ageThreshold,
    requiredStateCode: opts.requiredStateCode ?? parsed.fields.state_code,
    requiredDistrictCode: 0,
    proofLevel: 2,
  };

  const issuerCredential = await demoIssuerCredential(claimType, parsed.fields, secret);

  const witnessInput = buildWitness({
    claimType,
    fields: parsed.fields,
    secret,
    request,
    issuerCredential,
  });

  const result = await generateProof({
    claimType,
    witnessInput,
    wasmUrl: `/circuits/${circuit}.wasm`,
    zkeyUrl: `/circuits/${circuit}.zkey`,
  });

  return { ...result, demo: sig.demo };
}
