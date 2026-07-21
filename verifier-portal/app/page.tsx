"use client";

import { Fragment, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DEMO_VERIFIER = "99999";

// The set of asks a verifier can make. Mirrors the API's claim catalogue; a real
// portal would fetch /v1/claims, but hardcoding keeps the demo offline-friendly.
const ASKS = [
  { id: "age_above_18", label: "Age 18 or older", expected: { age_threshold: 18 } },
  { id: "age_above_21", label: "Age 21 or older", expected: { age_threshold: 21 } },
  { id: "india_citizen", label: "Holds a valid Aadhaar", expected: {} },
  { id: "state_resident", label: "Resident of Andhra Pradesh", expected: { required_state_code: 28 } },
  { id: "compound_kyc", label: "Full KYC (citizen + 18+ + AP)", expected: { age_threshold: 18, required_state_code: 28 } },
];

export default function VerifierHome() {
  const [askId, setAskId] = useState("age_above_18");
  const [pasted, setPasted] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = ASKS.find((a) => a.id === askId)!;

  async function onVerify() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const bundle = JSON.parse(pasted);
      // Accept either a raw proof bundle (from the citizen portal's download) or
      // a full verify request.
      const body = bundle.proof_bundle
        ? bundle
        : {
            proof_bundle: {
              proof: bundle.proof,
              public_signals: bundle.publicSignals || bundle.public_signals,
              claim_type: bundle.claimType || bundle.claim_type,
              generated_at: bundle.generatedAt || bundle.generated_at || Math.floor(Date.now() / 1000),
              demo: bundle.demo ?? true,
            },
            verifier_id: DEMO_VERIFIER,
            expected: ask.expected,
          };
      const res = await fetch(`${API}/v1/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message?.includes("JSON") ? "That doesn't look like a proof bundle (invalid JSON)." : `${e.message} (is the API running at ${API}?)`);
    } finally {
      setBusy(false);
    }
  }

  const requestPayload = {
    verifier_id: DEMO_VERIFIER,
    claim_type: ask.id,
    expected: ask.expected,
    expiry: Math.floor(Date.now() / 1000) + 300,
  };

  return (
    <main className="container">
      <section className="hero">
        <h1>Verify a citizen — without collecting their data</h1>
        <p>
          Request a proof of exactly the fact you need. The citizen&apos;s device
          returns a proof; you learn only whether the claim holds. No Aadhaar
          number, no date of birth, no address ever reaches your systems — so there
          is nothing for you to secure, breach, or be liable for.
        </p>
      </section>

      <div className="card">
        <h2><span className="step-badge">1</span> Choose what to request</h2>
        <label>Claim to request from the citizen</label>
        <select value={askId} onChange={(e) => { setAskId(e.target.value); setResult(null); }}>
          {ASKS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <p className="sub" style={{ marginTop: 12 }}>
          Hand this request to the citizen (in production: as a QR code or deep
          link into their ZKGate wallet).
        </p>
        <textarea readOnly value={JSON.stringify(requestPayload, null, 2)} style={{ minHeight: 130 }} />
      </div>

      <div className="card">
        <h2><span className="step-badge">2</span> Verify the returned proof</h2>
        <p className="sub">
          Paste the proof bundle the citizen produced (the citizen portal&apos;s
          &quot;Download proof&quot; button gives you exactly this).
        </p>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder='{ "proof": {...}, "publicSignals": [...], "claimType": "age_above_18" }'
        />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn green" onClick={onVerify} disabled={busy || !pasted.trim()}>
            {busy ? <><span className="spinner" /> Verifying…</> : "Verify proof"}
          </button>
        </div>
      </div>

      {result && (
        <div className="card">
          <h2>Result</h2>
          <div className="row" style={{ marginBottom: 12 }}>
            {result.valid
              ? <span className="pill ok">✓ CLAIM VERIFIED</span>
              : <span className="pill bad">✕ {result.fresh === false ? "REPLAY REJECTED" : "NOT VERIFIED"}</span>}
            {result.trust_level && <span className="pill demo">{result.trust_level}</span>}
          </div>
          <div className="kv">
            {Object.entries(result.claims || {}).map(([k, v]) => (
              <Fragment key={k}>
                <div className="k">{k}</div>
                <div className="v">{String(v)}</div>
              </Fragment>
            ))}
            {result.nullifier && (<Fragment><div className="k">Nullifier</div><div className="v mono" style={{ fontSize: 12 }}>{result.nullifier}</div></Fragment>)}
            {result.error && (<Fragment><div className="k">Reason</div><div className="v" style={{ color: "var(--bad)" }}>{result.error}</div></Fragment>)}
          </div>
          <p className="notice" style={{ marginTop: 14 }}>
            Notice what you did <em>not</em> receive: no name, no DOB, no address, no
            Aadhaar number. Only the boolean claim and an anonymous nullifier you can
            use to reject a replay.
          </p>
        </div>
      )}

      {error && (
        <div className="card" style={{ borderColor: "var(--bad)" }}>
          <strong style={{ color: "var(--bad)" }}>Error</strong>
          <p style={{ marginBottom: 0 }}>{error}</p>
        </div>
      )}
    </main>
  );
}
