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

The synthetic XMLs have no real signature, so the portal cannot check one. In demo mode it sets the
circuit's `signature_valid` input to 1 and tags the proof bundle `"demo": true`. The backend
honours that tag: demo proofs verify cryptographically (the Groth16 maths is real) but are reported
as `trust_level: "demo"` and a production verifier is expected to reject them.

**This is the single gap between this prototype and a deployable system.** The ZK layer is real; the
attestation that the data came from UIDAI is stubbed. `docs/UIDAI_INTEGRATION.md` sets out what
closing it takes — in short, the RSA-SHA256 XMLDSig check has to move *inside* the circuit so that
`signature_valid` is a proven fact rather than a claim the citizen's own client makes about itself.
