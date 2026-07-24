# Test Data

Everything in this directory is **synthetic**. No file here contains, or is derived from, a real
person's Aadhaar data, and none of them carry a valid UIDAI signature.

## Files

| File | What it is |
| --- | --- |
| `sample_aadhaar.xml` | One synthetic Offline eKYC XML in UIDAI's published element layout. The primary demo citizen (Madhan Kumar, DOB 10-07-1998, Chittoor AP). |
| `generate_test_xml.py` | Generates `test_citizen_1..4.xml` — an adult in AP, an adult in Maharashtra, an over-21 in Delhi, and a minor. Run `python generate_test_xml.py`. |
| `demo_proof_inputs.json` | Circuit witnesses with signal names matching the circom sources, including the cases that must be **unprovable**. |
| `uidai_public_key.pem` | Placeholder. Instructions inside for fetching the real UIDAI signing certificate. |

## Where real data comes from

A citizen downloads their own Offline eKYC XML from <https://myaadhaar.uidai.gov.in/> — a
password-protected ZIP that UIDAI signs. In ZKGate that file is opened **in the citizen's browser**,
parsed there, and used to build a proof there. The XML is never uploaded, and the backend has no
endpoint that would accept one.

## Demo mode vs. production

The synthetic XMLs have no real UIDAI signature. No circuit here takes a
client-asserted `signature_valid` bit any more — every one of them requires a
genuine EdDSA-Poseidon signature from a registered issuer key over the exact
attributes being proved (see `scripts/issuer/issue_credential.mjs` and
`docs/UIDAI_INTEGRATION.md`). What stays "demo" is the issuer key itself: the
demo issuer key (`scripts/issuer/demo_issuer_key.json`, gitignored) is not
registered in `backend/services/issuer_registry.py`, so proofs signed with it
verify cryptographically (the Groth16 maths is real) but report
`trust_level: "demo"`, and a production verifier is expected to require
`"attested"` instead.

**The remaining gap between this prototype and a deployable system** is that
the issuer's signature attests "I, the issuer, checked UIDAI's signature at
enrolment" — not a UIDAI signature verified in-circuit directly.
`docs/UIDAI_INTEGRATION.md` sets out that trust model precisely, and
`docs/XML_SIGNATURE_SPIKE.md` estimates what moving the RSA-SHA256 XMLDSig
check itself inside the circuit would cost.
