"use client";

import { Fragment, useState } from "react";
import { CLAIMS, claimById } from "@/lib/claims";
import { parse, prove, type ParsedAadhaar, type ProofResult } from "@/lib/prove";
import { Landing } from "@/components/Landing";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
// The demo verifier "99999" (Demo Bank). A real citizen scans a verifier's
// request; here we hardcode one so the page is self-contained.
const DEMO_VERIFIER = "99999";

type Stage = "input" | "parsed" | "proving" | "proved";

export default function Home() {
  const [xml, setXml] = useState("");
  const [parsed, setParsed] = useState<ParsedAadhaar | null>(null);
  const [claimId, setClaimId] = useState("age_above_18");
  const [stage, setStage] = useState<Stage>("input");
  const [proof, setProof] = useState<ProofResult | null>(null);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const claim = claimById(claimId)!;

  async function onParse() {
    setError(null);
    try {
      const p = await parse(xml);
      setParsed(p);
      setStage("parsed");
    } catch (e: any) {
      setError(e.message || String(e));
    }
  }

  async function onProve() {
    if (!parsed) return;
    setError(null);
    setBusy(true);
    setStage("proving");
    setVerifyResult(null);
    try {
      const ageThreshold =
        claim.id === "age_above_21" ? 21 : claim.id === "age_above_60" ? 60 : 18;
      const result = await prove({
        xml,
        parsed,
        claimType: claim.id,
        circuit: claim.circuit,
        verifierId: DEMO_VERIFIER,
        ageThreshold,
        requiredStateCode: parsed.fields.state_code,
      });
      setProof(result);
      setStage("proved");
    } catch (e: any) {
      setError(
        (e.message || String(e)) +
          " — for claims you don't satisfy (e.g. proving 60+ when younger), the " +
          "circuit refuses to build a proof at all. That's the design working.",
      );
      setStage("parsed");
    } finally {
      setBusy(false);
    }
  }

  async function onSend() {
    if (!proof) return;
    setBusy(true);
    setError(null);
    try {
      const ageThreshold =
        claim.id === "age_above_21" ? 21 : claim.id === "age_above_60" ? 60 : 18;
      const body = {
        proof_bundle: {
          proof: proof.proof,
          public_signals: proof.publicSignals,
          claim_type: proof.claimType,
          generated_at: proof.generatedAt,
          demo: proof.demo,
        },
        verifier_id: DEMO_VERIFIER,
        expected: {
          age_threshold: ageThreshold,
          required_state_code: parsed?.fields.state_code ?? 0,
        },
      };
      const res = await fetch(`${API}/v1/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setVerifyResult(await res.json());
    } catch (e: any) {
      setError(`Could not reach the verifier API at ${API}: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStage(parsed ? "parsed" : "input");
    setProof(null);
    setVerifyResult(null);
    setError(null);
  }

  return (
    <>
      <Landing onTryDemo={() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })} />
      <main className="container" id="demo">
      <div className="demo-title">
        <h2>Try it yourself</h2>
        <p className="sub">Every step below runs live, against the real circuits.</p>
      </div>
      {/* STEP 1 — XML */}
      <div className="card">
        <h2>
          <span className={`step-badge ${parsed ? "done" : ""}`}>1</span>
          Your Aadhaar XML
        </h2>
        <p className="sub">
          Paste the contents of your UIDAI offline eKYC XML. Don&apos;t have one? Use
          a synthetic test citizen below.
        </p>
        <textarea
          value={xml}
          onChange={(e) => setXml(e.target.value)}
          placeholder="<?xml version=&quot;1.0&quot;?><OfflinePaperlessKyc ...>"
        />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={onParse} disabled={!xml.trim()}>
            Parse locally
          </button>
          <button
            className="btn secondary"
            onClick={() => setXml(SAMPLE_XML)}
          >
            Load test citizen (Madhan, 28, AP)
          </button>
        </div>
        <p className="notice" style={{ marginTop: 12 }}>
          🔒 Parsing happens entirely in your browser. There is no upload endpoint —
          the network tab will show no request here.
        </p>
      </div>

      {/* STEP 1 result */}
      {parsed && (
        <div className="card">
          <h2>What we read (stays on your device)</h2>
          <div className="kv">
            <div className="k">Name</div>
            <div className="v leaked">{parsed.raw.name}</div>
            <div className="k">Date of birth</div>
            <div className="v leaked">{parsed.raw.dob}</div>
            <div className="k">State</div>
            <div className="v">
              {parsed.raw.stateName} <span className="mono">(code {parsed.fields.state_code})</span>
            </div>
            <div className="k">Address / pincode</div>
            <div className="v leaked">
              {parsed.raw.district}, {parsed.raw.pincode}
            </div>
          </div>
          <p className="notice" style={{ marginTop: 12 }}>
            Everything shown in <span className="leaked">red</span> is private and
            will <strong>not</strong> be in the proof.
          </p>
        </div>
      )}

      {/* STEP 2 — choose claim */}
      {parsed && (
        <div className="card">
          <h2>
            <span className={`step-badge ${proof ? "done" : ""}`}>2</span>
            What do you want to prove?
          </h2>
          <label>Claim</label>
          <select value={claimId} onChange={(e) => { setClaimId(e.target.value); reset(); }}>
            {CLAIMS.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <p className="sub" style={{ marginTop: 10 }}>{claim.blurb}</p>

          <div className="row" style={{ gap: 30, marginTop: 8 }}>
            <div>
              <div className="k" style={{ color: "var(--green)", fontWeight: 700, fontSize: 13 }}>
                ✓ The verifier learns
              </div>
              <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
                {claim.reveals.map((r) => (
                  <li key={r} className="private" style={{ fontSize: 13.5 }}>{r}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="k" style={{ color: "var(--bad)", fontWeight: 700, fontSize: 13 }}>
                ✕ Stays hidden
              </div>
              <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
                {claim.hidden.map((h) => (
                  <li key={h} style={{ fontSize: 13.5, color: "var(--muted)" }}>{h}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={onProve} disabled={busy}>
              {busy && stage === "proving" ? (
                <><span className="spinner" /> Generating proof…</>
              ) : (
                "Generate zero-knowledge proof"
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — proof + send */}
      {proof && (
        <div className="card">
          <h2>
            <span className="step-badge done">3</span>
            Your proof is ready
          </h2>
          <p className="sub">
            This ~800-byte object proves your claim. Inspect it — there is no date of
            birth, no name, no address anywhere in it.
          </p>
          <div className="kv">
            <div className="k">Claim</div><div className="v">{proof.claimType}</div>
            <div className="k">Trust level</div>
            <div className="v">
              <span className="pill demo">{proof.demo ? "demo" : "attested"}</span>
            </div>
            <div className="k">Public signals</div>
            <div className="v mono" style={{ fontSize: 12 }}>
              [{proof.publicSignals.join(", ")}]
            </div>
            <div className="k">Nullifier</div>
            <div className="v mono" style={{ fontSize: 12 }}>{proof.publicSignals[1]}</div>
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn green" onClick={onSend} disabled={busy}>
              {busy ? <><span className="spinner" /> Verifying…</> : "Send to Demo Bank for verification"}
            </button>
            <button className="btn secondary" onClick={() => downloadJson(proof)}>
              Download proof
            </button>
          </div>
        </div>
      )}

      {/* Verify result */}
      {verifyResult && (
        <div className="card">
          <h2>Verifier response</h2>
          <div className="row" style={{ marginBottom: 10 }}>
            {verifyResult.valid ? (
              <span className="pill ok">✓ VALID</span>
            ) : (
              <span className="pill bad">✕ {verifyResult.fresh === false ? "REPLAY REJECTED" : "INVALID"}</span>
            )}
            <span className="pill demo">{verifyResult.trust_level}</span>
          </div>
          <div className="kv">
            {Object.entries(verifyResult.claims || {}).map(([k, v]) => (
              <Fragment key={k}>
                <div className="k">{k}</div>
                <div className="v">{String(v)}</div>
              </Fragment>
            ))}
            {verifyResult.error && (<Fragment><div className="k">Error</div><div className="v" style={{ color: "var(--bad)" }}>{verifyResult.error}</div></Fragment>)}
          </div>
          <p className="notice" style={{ marginTop: 12 }}>
            Send the same proof again → the verifier rejects it as a replay. The
            nullifier is spent. Regenerate a fresh proof to try once more.
          </p>
        </div>
      )}

      {error && (
        <div className="card" style={{ borderColor: "var(--bad)" }}>
          <strong style={{ color: "var(--bad)" }}>Note</strong>
          <p style={{ marginBottom: 0, fontSize: 14 }}>{error}</p>
        </div>
      )}
      </main>
    </>
  );
}

function downloadJson(obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "zkgate-proof.json";
  a.click();
  URL.revokeObjectURL(url);
}

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<OfflinePaperlessKyc referenceId="xxxx1234567890" ts="2026-07-10T14:23:00" ver="1.0">
  <UidData uid="xxxx-xxxx-3632">
    <Poi dob="10-07-1998" gender="M" name="Madhan Kumar"/>
    <Poa co="S/O Suresh Kumar" dist="Chittoor" house="12/4"
         lm="Near APSRTC Bus Stand" loc="Ganesh Nagar"
         pc="517001" po="Chittoor HO"
         state="Andhra Pradesh" street="MG Road"
         subdist="Chittoor" vtc="Chittoor"/>
    <Pht>iVBORw0KGgoAAAANSUhEUg==</Pht>
  </UidData>
  <Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
    <ds:SignatureValue>DEMO_SYNTHETIC_SIGNATURE</ds:SignatureValue>
  </Signature>
</OfflinePaperlessKyc>`;
