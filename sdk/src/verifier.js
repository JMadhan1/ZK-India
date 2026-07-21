/**
 * Verifier-side client — for the institution integrating ZKGate.
 *
 * Two ways to use it:
 *   1. requestProof(): describe what you want; hand the request to a citizen's
 *      wallet/portal, which returns a proof bundle.
 *   2. verify(): POST that bundle to the ZKGate API and get back {valid, claims}.
 *
 * A verifier NEVER sees personal data — only the boolean claim and, where the
 * citizen chose to reveal it, a coarse fact like a state code.
 */

/** Seconds from now that a proof request should stay valid. Short by default:
 *  the expiry is bound into the nullifier, so a tight window limits replay reuse. */
const DEFAULT_TTL_SECONDS = 300;

/**
 * Build a proof request to hand to a citizen.
 *
 * @param {object} opts
 * @param {string} opts.verifierId
 * @param {string} opts.claimType
 * @param {number} [opts.ageThreshold]
 * @param {number} [opts.requiredStateCode]
 * @param {number} [opts.requiredDistrictCode]
 * @param {number} [opts.requiredPincode]
 * @param {number} [opts.proofLevel]
 * @param {number} [opts.ttlSeconds]
 */
export function requestProof(opts) {
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  return {
    verifierId: String(opts.verifierId),
    claimType: opts.claimType,
    ageThreshold: opts.ageThreshold,
    requiredStateCode: opts.requiredStateCode ?? 0,
    requiredDistrictCode: opts.requiredDistrictCode ?? 0,
    requiredPincode: opts.requiredPincode ?? 0,
    proofLevel: opts.proofLevel,
    expiry: Math.floor(Date.now() / 1000) + ttl,
    // The 'expected' block the API uses to reject a valid-but-off-topic proof.
    expected: {
      age_threshold: opts.ageThreshold,
      required_state_code: opts.requiredStateCode ?? 0,
      required_district_code: opts.requiredDistrictCode ?? 0,
    },
  };
}

/**
 * Submit a proof bundle for verification.
 *
 * @param {object} p
 * @param {string} p.apiUrl        e.g. "http://localhost:8000"
 * @param {string} p.verifierId
 * @param {object} p.proofResult   from generateProof(): { proof, publicSignals, claimType, generatedAt }
 * @param {object} [p.expected]    the request's `expected` block
 * @param {boolean} [p.demo]
 * @param {string} [p.apiKey]
 * @param {typeof fetch} [p.fetchImpl]  injectable for tests / non-browser envs
 */
export async function verify({
  apiUrl,
  verifierId,
  proofResult,
  expected = {},
  demo = true,
  apiKey = null,
  fetchImpl = globalThis.fetch,
}) {
  const body = {
    proof_bundle: {
      proof: proofResult.proof,
      public_signals: proofResult.publicSignals,
      claim_type: proofResult.claimType,
      circuit_version: "1.0.0",
      generated_at: proofResult.generatedAt ?? Math.floor(Date.now() / 1000),
      demo,
    },
    verifier_id: String(verifierId),
    expected,
  };

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["X-API-Key"] = apiKey;

  const res = await fetchImpl(`${apiUrl.replace(/\/$/, "")}/v1/verify`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ZKGate verify failed: ${res.status} ${text}`);
  }
  return res.json();
}
