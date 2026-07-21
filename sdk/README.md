# @zkgate/sdk

Client SDK for ZKGate India. See the repo root README and docs/.

- `encoding` — state/district/pincode codes (byte-identical to the Python backend)
- `aadhaar` — parse Offline eKYC XML, demo-mode signature check
- `prover` — derive secret, build witness, generate Groth16 proof
- `verifier` — build a proof request, submit a proof for verification

Everything on the citizen side runs locally; the XML never leaves the device.
