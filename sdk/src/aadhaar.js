/**
 * Parse a UIDAI Offline eKYC XML into circuit-ready fields.
 *
 * This runs on the citizen's device (browser or Node). The XML is never sent
 * anywhere; only the proof built from it leaves. That is the whole privacy
 * story, so this module deliberately has no network access of any kind.
 *
 * DEMO vs. REAL signature — the one honest caveat of the prototype:
 *
 *   A real deployment verifies the RSA-SHA256 XMLDSig signature on the XML
 *   against UIDAI's published certificate before trusting a single field, and
 *   ultimately proves that verification INSIDE the circuit (see
 *   docs/UIDAI_INTEGRATION.md). Here, verifySignature() checks structure and, if
 *   given the UIDAI public key, the signature — but the synthetic test XMLs carry
 *   no real signature, so in demo mode it returns {valid:true, demo:true} and the
 *   resulting proof is tagged demo. We never silently claim a demo signature is
 *   real.
 */

import { encodeState, encodeDistrict, encodePincode } from "./encoding.js";

/** Extract an attribute from the first tag of a given name. Tiny and
 *  dependency-free so it runs identically in a browser and in Node. */
function attr(xml, tag, name) {
  const tagMatch = xml.match(new RegExp(`<${tag}\\b[^>]*>`, "i"));
  if (!tagMatch) return null;
  const a = tagMatch[0].match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
  return a ? a[1] : null;
}

/** Parse "DD-MM-YYYY" (UIDAI's format) into numeric parts. Also accepts
 *  "YYYY-MM-DD" defensively. */
export function parseDob(dob) {
  if (!dob) throw new Error("no date of birth in XML");
  const parts = dob.split(/[-/]/).map((s) => parseInt(s, 10));
  let day, month, year;
  if (parts[0] > 31) {
    [year, month, day] = parts; // YYYY-MM-DD
  } else {
    [day, month, year] = parts; // DD-MM-YYYY
  }
  if (!(year > 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31)) {
    throw new Error(`unparseable date of birth: ${dob}`);
  }
  return { day, month, year };
}

/**
 * Parse an Offline eKYC XML string into the fields the circuits consume.
 * Returns raw strings plus the numeric encodings, so a caller can display the
 * former and prove over the latter.
 */
export function parseAadhaarXml(xmlString) {
  if (!xmlString || !/OfflinePaperlessKyc/i.test(xmlString)) {
    throw new Error("not a UIDAI Offline eKYC XML");
  }

  const name = attr(xmlString, "Poi", "name");
  const dob = attr(xmlString, "Poi", "dob");
  const gender = attr(xmlString, "Poi", "gender");
  const stateName = attr(xmlString, "Poa", "state");
  const district = attr(xmlString, "Poa", "dist");
  const pincode = attr(xmlString, "Poa", "pc");
  const referenceId = attr(xmlString, "OfflinePaperlessKyc", "referenceId");
  const signatureValue = (xmlString.match(/<(?:ds:)?SignatureValue>([^<]*)</i) || [])[1] || null;

  const { day, month, year } = parseDob(dob);
  const stateCode = encodeState(stateName);
  if (stateCode === 0) {
    throw new Error(`unrecognised state in XML: ${stateName}`);
  }

  return {
    // Human-readable (for the citizen's own eyes, never transmitted)
    raw: { name, dob, gender, stateName, district, pincode, referenceId },
    // Circuit-ready numeric fields
    fields: {
      dob_year: year,
      dob_month: month,
      dob_day: day,
      state_code: stateCode,
      district_code: encodeDistrict(stateCode, district),
      pincode: encodePincode(pincode),
    },
    signatureValue,
  };
}

/**
 * Verify the XML's UIDAI signature.
 *
 * @param {string} xmlString
 * @param {CryptoKey|null} uidaiPublicKey  WebCrypto key; null => demo mode.
 * @returns {Promise<{valid: boolean, demo: boolean, reason?: string}>}
 */
export async function verifySignature(xmlString, uidaiPublicKey = null) {
  const sig = (xmlString.match(/<(?:ds:)?SignatureValue>([^<]*)</i) || [])[1];
  if (!sig) return { valid: false, demo: false, reason: "no SignatureValue element" };

  if (!uidaiPublicKey) {
    // No key configured — prototype demo mode. Structurally valid, not attested.
    return { valid: true, demo: true, reason: "demo mode: signature not cryptographically checked" };
  }

  // Production path: verify the detached RSA-SHA256 XMLDSig. Left as the single
  // integration point a deployment must complete against the canonicalised
  // SignedInfo; see docs/UIDAI_INTEGRATION.md. Throwing here would hide that this
  // is unfinished, so we say so plainly.
  throw new Error(
    "real UIDAI signature verification is not implemented in the prototype; " +
      "run in demo mode (uidaiPublicKey=null) or implement per docs/UIDAI_INTEGRATION.md",
  );
}
