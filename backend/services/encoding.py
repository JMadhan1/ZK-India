"""
Shared encoding for Indian administrative geography.

The circuits compare numbers, not strings, so "Andhra Pradesh" and "Chittoor"
have to become field elements somewhere. That somewhere must produce the SAME
number on the citizen's device (TypeScript, sdk/src/encoding.ts) and on the
verifier's server (this file). If the two ever disagree, every location proof
silently fails to verify and the error surfaces as "invalid proof" with no clue
why. tests/test_encoding_parity.py pins them together.

State codes are the Census of India / LGD codes — a real, stable, government
numbering (28 = Andhra Pradesh), so they need no invention on our part.

Districts have no equally stable short code that is convenient here, so we hash
the name. The hash does not need to be cryptographic: district_code is a PRIVATE
circuit input, compared only for equality against what the verifier asks for.
It needs to be deterministic and identical across languages, which FNV-1a is and
Python's built-in hash() emphatically is not (it is salted per process).
"""

from __future__ import annotations

import re
import unicodedata

# ── Census of India state / UT codes ─────────────────────────────────────────
STATE_CODES: dict[str, int] = {
    "Jammu and Kashmir": 1,
    "Himachal Pradesh": 2,
    "Punjab": 3,
    "Chandigarh": 4,
    "Uttarakhand": 5,
    "Haryana": 6,
    "Delhi": 7,
    "Rajasthan": 8,
    "Uttar Pradesh": 9,
    "Bihar": 10,
    "Sikkim": 11,
    "Arunachal Pradesh": 12,
    "Nagaland": 13,
    "Manipur": 14,
    "Mizoram": 15,
    "Tripura": 16,
    "Meghalaya": 17,
    "Assam": 18,
    "West Bengal": 19,
    "Jharkhand": 20,
    "Odisha": 21,
    "Chhattisgarh": 22,
    "Madhya Pradesh": 23,
    "Gujarat": 24,
    "Daman and Diu": 25,
    "Dadra and Nagar Haveli": 26,
    "Maharashtra": 27,
    "Andhra Pradesh": 28,
    "Karnataka": 29,
    "Goa": 30,
    "Lakshadweep": 31,
    "Kerala": 32,
    "Tamil Nadu": 33,
    "Puducherry": 34,
    "Andaman and Nicobar Islands": 35,
    "Telangana": 36,
    "Ladakh": 37,
    "Dadra and Nagar Haveli and Daman and Diu": 38,
}

# Aadhaar XMLs are typed by humans at enrolment centres and spell states every
# which way. An unrecognised state means a citizen simply cannot prove where
# they live, so the aliases matter more than they look.
STATE_ALIASES: dict[str, str] = {
    "j&k": "Jammu and Kashmir",
    "jammu & kashmir": "Jammu and Kashmir",
    "nct of delhi": "Delhi",
    "new delhi": "Delhi",
    "delhi ncr": "Delhi",
    "orissa": "Odisha",
    "pondicherry": "Puducherry",
    "puduchery": "Puducherry",
    "uttaranchal": "Uttarakhand",
    "andaman & nicobar islands": "Andaman and Nicobar Islands",
    "a & n islands": "Andaman and Nicobar Islands",
    "dadra & nagar haveli": "Dadra and Nagar Haveli",
    "daman & diu": "Daman and Diu",
    "tamilnadu": "Tamil Nadu",
    "chattisgarh": "Chhattisgarh",
}

STATE_NAMES: dict[int, str] = {v: k for k, v in STATE_CODES.items()}

FNV_OFFSET_BASIS = 0x811C9DC5
FNV_PRIME = 0x01000193
UINT32 = 0xFFFFFFFF


def normalize(name: str) -> str:
    """Lowercase, strip accents/punctuation, collapse whitespace, '&' -> 'and'."""
    if not name:
        return ""
    decomposed = unicodedata.normalize("NFKD", name)
    ascii_only = "".join(c for c in decomposed if not unicodedata.combining(c))
    lowered = ascii_only.lower().strip()
    lowered = lowered.replace("&", " and ")
    lowered = re.sub(r"[^a-z0-9\s]", " ", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


def fnv1a32(text: str) -> int:
    """FNV-1a, 32-bit. Must match fnv1a32() in sdk/src/encoding.ts byte for byte."""
    h = FNV_OFFSET_BASIS
    for byte in text.encode("utf-8"):
        h ^= byte
        h = (h * FNV_PRIME) & UINT32
    return h


def encode_state(state: str) -> int:
    """
    Census state code, or 0 if the name is unrecognised.

    0 is the circuit's "any" wildcard, so an unknown state must NEVER be encoded
    as 0 in a citizen's *witness* — that would turn a failed lookup into a proof
    that matches every state. Callers building a witness must treat 0 as an error;
    only a verifier's `required_state_code` may legitimately be 0.
    """
    if not state:
        return 0
    key = normalize(state)
    for canonical, code in STATE_CODES.items():
        if normalize(canonical) == key:
            return code
    alias = STATE_ALIASES.get(key)
    if alias:
        return STATE_CODES[alias]
    return 0


def state_name(code: int) -> str | None:
    return STATE_NAMES.get(int(code))


def encode_district(state_code: int, district: str) -> int:
    """
    state_code * 100_000 + (FNV-1a(district) mod 100_000).

    Namespacing by state means "Aurangabad, Maharashtra" and "Aurangabad, Bihar"
    cannot collide, and the 100k modulus keeps collisions within a single state
    at roughly 1-in-100k for the few hundred districts each has. A collision is
    not a security hole — it would let a citizen from district A satisfy a demand
    for colliding district B in the same state — but it is a correctness bug, so
    a production deployment should swap this for the LGD district code registry.
    """
    if not district:
        return 0
    return state_code * 100_000 + (fnv1a32(normalize(district)) % 100_000)


def encode_pincode(pincode: str | int) -> int:
    """Indian pincodes are exactly six digits and never start with 0."""
    if pincode is None:
        return 0
    digits = re.sub(r"\D", "", str(pincode))
    if len(digits) != 6:
        return 0
    return int(digits)
