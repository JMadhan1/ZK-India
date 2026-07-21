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

  const witnessInput = buildWitness({
    claimType,
    fields: parsed.fields,
    secret,
    request,
    signatureValid: sig.valid,
  });

  const result = await generateProof({
    claimType,
    witnessInput,
    wasmUrl: `/circuits/${circuit}.wasm`,
    zkeyUrl: `/circuits/${circuit}.zkey`,
  });

  return { ...result, demo: sig.demo };
}
