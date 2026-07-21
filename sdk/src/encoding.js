/**
 * Geography encoding — the TypeScript/JS twin of backend/services/encoding.py.
 *
 * These two files MUST produce identical numbers for identical inputs. The
 * citizen's browser encodes their state/district here to build the witness; the
 * verifier's server encodes the verifier's requirement in Python. If they drift,
 * every location proof silently fails to verify with no useful error. The parity
 * is pinned by sdk/test/encoding.parity.test.mjs, which runs the Python encoder
 * over the same inputs and diffs the results.
 *
 * Keep the two files edited together.
 */

// ── Census of India state / UT codes ──
export const STATE_CODES = {
  "Jammu and Kashmir": 1, "Himachal Pradesh": 2, "Punjab": 3, "Chandigarh": 4,
  "Uttarakhand": 5, "Haryana": 6, "Delhi": 7, "Rajasthan": 8, "Uttar Pradesh": 9,
  "Bihar": 10, "Sikkim": 11, "Arunachal Pradesh": 12, "Nagaland": 13, "Manipur": 14,
  "Mizoram": 15, "Tripura": 16, "Meghalaya": 17, "Assam": 18, "West Bengal": 19,
  "Jharkhand": 20, "Odisha": 21, "Chhattisgarh": 22, "Madhya Pradesh": 23,
  "Gujarat": 24, "Daman and Diu": 25, "Dadra and Nagar Haveli": 26,
  "Maharashtra": 27, "Andhra Pradesh": 28, "Karnataka": 29, "Goa": 30,
  "Lakshadweep": 31, "Kerala": 32, "Tamil Nadu": 33, "Puducherry": 34,
  "Andaman and Nicobar Islands": 35, "Telangana": 36, "Ladakh": 37,
  "Dadra and Nagar Haveli and Daman and Diu": 38,
};

const STATE_ALIASES = {
  "j&k": "Jammu and Kashmir", "jammu & kashmir": "Jammu and Kashmir",
  "nct of delhi": "Delhi", "new delhi": "Delhi", "delhi ncr": "Delhi",
  "orissa": "Odisha", "pondicherry": "Puducherry", "puduchery": "Puducherry",
  "uttaranchal": "Uttarakhand",
  "andaman & nicobar islands": "Andaman and Nicobar Islands",
  "a & n islands": "Andaman and Nicobar Islands",
  "dadra & nagar haveli": "Dadra and Nagar Haveli", "daman & diu": "Daman and Diu",
  "tamilnadu": "Tamil Nadu", "chattisgarh": "Chhattisgarh",
};

const STATE_NAMES = Object.fromEntries(
  Object.entries(STATE_CODES).map(([name, code]) => [code, name]),
);

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Lowercase, strip accents/punctuation, collapse whitespace, '&' -> 'and'.
 *  Mirrors normalize() in encoding.py exactly. */
export function normalize(name) {
  if (!name) return "";
  const decomposed = name.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return decomposed
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** FNV-1a 32-bit. Must match fnv1a32() in encoding.py byte for byte.
 *  `>>> 0` keeps every step an unsigned 32-bit int, as Python's & 0xFFFFFFFF does. */
export function fnv1a32(text) {
  let h = FNV_OFFSET_BASIS;
  const bytes = new TextEncoder().encode(text);
  for (const b of bytes) {
    h ^= b;
    // Multiply in 32-bit space without losing precision: Math.imul does exactly that.
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

/** Census state code, or 0 if unrecognised. 0 is the circuit wildcard, so a
 *  witness builder must treat 0 as an error, never as a match. */
export function encodeState(state) {
  if (!state) return 0;
  const key = normalize(state);
  for (const [canonical, code] of Object.entries(STATE_CODES)) {
    if (normalize(canonical) === key) return code;
  }
  const alias = STATE_ALIASES[key];
  if (alias) return STATE_CODES[alias];
  return 0;
}

export function stateName(code) {
  return STATE_NAMES[Number(code)] ?? null;
}

/** state_code * 100000 + (FNV-1a(district) mod 100000). Mirrors encode_district(). */
export function encodeDistrict(stateCode, district) {
  if (!district) return 0;
  return stateCode * 100000 + (fnv1a32(normalize(district)) % 100000);
}

/** Six digits, or 0. */
export function encodePincode(pincode) {
  if (pincode == null) return 0;
  const digits = String(pincode).replace(/\D/g, "");
  return digits.length === 6 ? Number(digits) : 0;
}
