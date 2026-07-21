/**
 * @zkgate/sdk — ZKGate India client SDK
 *
 * Citizen side:  parseAadhaarXml -> deriveSecret -> buildWitness -> generateProof
 * Verifier side: requestProof -> verify
 *
 * Everything on the citizen side runs locally; the Aadhaar XML never leaves the
 * device. Only the proof bundle produced by generateProof() is transmitted.
 */

export * as encoding from "./encoding.js";
export {
  encodeState, encodeDistrict, encodePincode, stateName, normalize, fnv1a32, STATE_CODES,
} from "./encoding.js";
export { parseAadhaarXml, parseDob, verifySignature } from "./aadhaar.js";
export { deriveSecret, buildWitness, generateProof, CLAIM_CIRCUIT } from "./prover.js";
export { requestProof, verify } from "./verifier.js";

export const CLAIM_TYPES = [
  "age_above_18", "age_above_21", "age_above_60", "voter_eligible",
  "state_resident", "district_resident", "india_citizen", "compound_kyc", "pan_holder",
];
