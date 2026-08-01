"use client";

import { ScrollReveal } from "@/components/ScrollReveal";

export function Landing({ onTryDemo }: { onTryDemo: () => void }) {
  return (
    <>
      <ScrollReveal />

      <header className="hero">
        <svg className="chakra-bg" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="95" fill="none" stroke="#5b8bf0" strokeWidth="1.2" />
          <circle cx="100" cy="100" r="10" fill="#5b8bf0" />
          <g stroke="#5b8bf0" strokeWidth="1.6">
            {Array.from({ length: 24 }, (_, i) => i * 15).map((deg) => (
              <line key={deg} x1="100" y1="70" x2="100" y2="8" transform={`rotate(${deg} 100 100)`} />
            ))}
          </g>
        </svg>

        <div className="wrap">
          <div className="badge">🇮🇳 Built for Sovereign Technology for India</div>
          <h1>
            Prove a fact about
            <br />
            yourself. <span className="grad">Not your identity.</span>
          </h1>
          <p className="hero-sub">
            ZKGate is the indigenous zero-knowledge identity layer. Prove you're over 18,
            a resident of your state, or a valid Aadhaar holder — using a ~800-byte
            cryptographic proof that reveals nothing else. No name. No date of birth.
            No address. No Aadhaar number ever leaves your device.
          </p>
          <div className="hero-cta">
            <button className="btn primary" onClick={onTryDemo}>Try the demo ↓</button>
            <a className="btn ghost" href="#how">See how it works</a>
          </div>

          <div className="flow">
            <div className="flow-step">
              <div className="k">Citizen's device</div>
              <div className="v">Aadhaar offline eKYC XML parsed entirely in-browser. Never uploaded.</div>
            </div>
            <div className="arrow">→</div>
            <div className="flow-step">
              <div className="k">Zero-knowledge proof</div>
              <div className="v">A Groth16 proof answers exactly one question — e.g. "age ≥ 18?" — nothing else.</div>
            </div>
            <div className="arrow">→</div>
            <div className="flow-step">
              <div className="k">Verifier</div>
              <div className="v">Checks the proof's math, the claim it actually answers, and rejects replays.</div>
            </div>
          </div>
        </div>
      </header>

      <section className="lp-sec" id="problem">
        <div className="wrap">
          <div className="eyebrow reveal">Why this exists</div>
          <h2 className="sec-h reveal">India's identity ecosystem runs on over-disclosure</h2>
          <p className="lede reveal">
            Proving one fact about yourself in India usually means handing over your entire
            identity. That design choice has a real, current cost.
          </p>
          <div className="stats">
            <div className="stat reveal">
              <div className="num" data-count="22495" data-prefix="₹" data-suffix=" Cr">₹0 Cr</div>
              <div className="lbl">Lost to cyber fraud in India in 2025, much of it built on "digital arrest" scams that rely on citizens believing sharing Aadhaar/PAN is a normal verification step.</div>
              <div className="src">Source: 2025 cyber-fraud reporting, PIB alerts</div>
            </div>
            <div className="stat reveal">
              <div className="num" data-count="7.9" data-suffix="M+">0M+</div>
              <div className="lbl">KYC records (Aadhaar, PAN, documents) leaked from a single compromised fintech vendor in January 2025 — a systemic risk of aggregating full documents.</div>
              <div className="src">Source: dark-web breach reporting, Jan 2025</div>
            </div>
            <div className="stat reveal">
              <div className="num">13 May 2027</div>
              <div className="lbl">DPDP Act deadline by which every gaming, social, and e-commerce platform in India must implement verifiable age/parental-consent checks — without creating a new data liability.</div>
              <div className="src">Source: DPDP Rules, notified Nov 2025</div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="how">
        <div className="wrap">
          <div className="eyebrow reveal">How it works</div>
          <h2 className="sec-h reveal">Real cryptography, not a mock</h2>
          <p className="lede reveal">
            Every layer verifies genuine cryptography — the backend's Python Groth16 verifier is
            cross-checked against snarkjs, and the JS/Python encoders are proven byte-identical so
            a proof built in the browser verifies on the server.
          </p>
          <div className="steps">
            <div className="step reveal">
              <div className="stepnum">1</div>
              <div><h4>Get the offline eKYC XML</h4><p>The citizen downloads their own UIDAI offline eKYC XML — OTP-gated, digit-masked, with a fresh rotating reference ID each time. It never touches any server in this system.</p></div>
            </div>
            <div className="step reveal">
              <div className="stepnum">2</div>
              <div><h4>Parse entirely in the browser</h4><p><code>sdk/src/aadhaar.js</code> parses the XML client-side — DOB, state, pincode, signature block — and it stays in memory on the citizen's device only.</p></div>
            </div>
            <div className="step reveal">
              <div className="stepnum">3</div>
              <div><h4>Derive a secret &amp; build the witness</h4><p>A Poseidon hash derives a private <code>aadhaar_secret</code>. The SDK assembles the private witness — DOB, state, secret, issuer-signed credential — for exactly the claim being proven.</p></div>
            </div>
            <div className="step reveal">
              <div className="stepnum">4</div>
              <div><h4>Generate the proof, on-device</h4><p><code>snarkjs.groth16.fullProve</code> runs the Circom circuit locally (wasm + proving key fetched as static assets) and outputs a ~800-byte Groth16 proof plus its public signals.</p></div>
            </div>
            <div className="step reveal">
              <div className="stepnum">5</div>
              <div><h4>Send only the proof</h4><p>The proof and public signals — never the XML, never the DOB, never the Aadhaar number — go to the verifier's <code>POST /v1/verify</code> endpoint.</p></div>
            </div>
            <div className="step reveal">
              <div className="stepnum">6</div>
              <div>
                <h4>Four checks on the backend</h4>
                <p>
                  <b>Pairing check</b> — an independent Python Groth16 verifier, cross-checked against snarkjs, rejects tampered proofs and off-curve points.<br />
                  <b>Semantic gate</b> — do the public signals actually answer what the verifier asked (an age≥18 proof can't satisfy an age≥21 request)?<br />
                  <b>Nullifier registry</b> — <code>Poseidon(secret, verifier_id, expiry)</code> catches replay, first-use-wins, per <code>(claim_type, nullifier)</code>.<br />
                  <b>Audit chain</b> — every verification is written to a hash-chained log; tampering with history is detectable.
                </p>
              </div>
            </div>
            <div className="step reveal">
              <div className="stepnum">7</div>
              <div><h4>Verifier gets a verdict, nothing else</h4><p>The response is <code>{"{ valid, claims, nullifier, trust_level }"}</code> — e.g. <code>{'{"age_above_18": true}'}</code>. No name, no DOB, no address, no Aadhaar number was ever transmitted or stored.</p></div>
            </div>
          </div>

          <div className="grid3" style={{ marginTop: 20 }}>
            <div className="glass-card reveal">
              <h3><span className="ic">🔒</span>Constrain, don't report</h3>
              <p>Circuits assert <code>is_valid === 1</code> rather than merely output a flag — a minor cannot generate an "age ≥ 18" proof at all. "The proof verifies" and "the claim is true" are the same statement.</p>
            </div>
            <div className="glass-card reveal">
              <h3><span className="ic">🛡️</span>Two-gate verification</h3>
              <p>A cryptographically valid proof can still answer the wrong question. The backend checks the pairing <em>and</em> that the public signals match what the verifier actually asked.</p>
            </div>
            <div className="glass-card reveal">
              <h3><span className="ic">🔁</span>Replay-proof by design</h3>
              <p>A nullifier — <code>Poseidon(secret, verifier_id, expiry)</code> — blocks replay per verifier while making cross-verifier tracking of the same citizen impossible.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="claims">
        <div className="wrap">
          <div className="eyebrow reveal">What can be proven</div>
          <h2 className="sec-h reveal">Five claim types, one private secret</h2>
          <p className="lede reveal">Every claim is bound to the same private secret — provably about one person, without exposing who that person is.</p>
          <div className="tablewrap reveal">
            <table className="zk-table">
              <thead><tr><th>Claim</th><th>Verifier learns</th><th>Stays private</th></tr></thead>
              <tbody>
                <tr><td>age_above_18 / 21 / 60</td><td>Age threshold met (boolean)</td><td>DOB, exact age, name, address, Aadhaar no.</td></tr>
                <tr><td>india_citizen</td><td>A UIDAI-signed Aadhaar exists</td><td>Everything else — only 4 public signals</td></tr>
                <tr><td>state_resident / district_resident</td><td>State (or state+district), only if asked</td><td>House, street, pincode, DOB, name</td></tr>
                <tr><td>compound_kyc</td><td>Valid Aadhaar + age ≥ N + state, bound to one person</td><td>DOB, exact age, full address, name</td></tr>
                <tr><td>pan_holder</td><td>Holds a linked PAN + a per-verifier pseudonym</td><td>The PAN number itself</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="compare">
        <div className="wrap">
          <div className="eyebrow reveal">Where this stands</div>
          <h2 className="sec-h reveal">Selective disclosure vs. true zero-knowledge</h2>
          <p className="lede reveal">
            Most "privacy-preserving" Aadhaar tools today share fewer fields — but still reveal the
            <em> real value</em> of whatever's shared. True zero-knowledge reveals only the boolean
            answer, never the value underneath. That distinction is the actual gap this project targets.
          </p>
          <div className="tablewrap reveal">
            <table className="zk-table">
              <thead><tr><th>System</th><th>Live today?</th><th>True ZK or selective disclosure?</th></tr></thead>
              <tbody>
                <tr><td>UIDAI New Aadhaar App</td><td><span className="yes">Yes</span> — 40M+ downloads</td><td><span className="mid">Selective disclosure</span> (reveals real value)</td></tr>
                <tr><td>Google Wallet Aadhaar VC</td><td><span className="yes">Yes</span></td><td><span className="mid">Selective disclosure</span> (ISO 18013-5 mdoc)</td></tr>
                <tr><td>Anon Aadhaar (Ethereum Foundation)</td><td><span className="no">Pre-production</span></td><td><span className="yes">True ZK</span> (QR-based)</td></tr>
                <tr><td>Self Protocol (self.xyz)</td><td><span className="yes">Yes</span>, funded</td><td><span className="yes">True ZK</span></td></tr>
                <tr><td className="you">ZKGate</td><td>Prototype</td><td className="you">True ZK — offline eKYC XML channel</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="architecture">
        <div className="wrap">
          <div className="eyebrow reveal">Under the hood</div>
          <h2 className="sec-h reveal">What's in the box</h2>
          <div className="bento">
            <div className="archcard span3 reveal"><div className="tag2">circuits/</div><h4>5 Circom circuits</h4><p>Groth16 over BN128 — age, location, citizenship, compound KYC, PAN — plus per-circuit trusted setup.</p></div>
            <div className="archcard span3 reveal"><div className="tag2">backend/</div><h4>FastAPI verification service</h4><p>Python Groth16 verifier, nullifier replay-guard, tamper-evident hash-chained audit log.</p></div>
            <div className="archcard span2 reveal"><div className="tag2">sdk/</div><h4>JavaScript SDK</h4><p>Parses Aadhaar XML, derives the secret, builds the witness, generates &amp; submits proofs.</p></div>
            <div className="archcard span2 reveal"><div className="tag2">frontend/</div><h4>Citizen portal</h4><p>In-browser proof generation — the XML never leaves the device.</p></div>
            <div className="archcard span2 reveal"><div className="tag2">verifier-portal/</div><h4>Verifier portal</h4><p>Request a claim, verify a proof, reject replays.</p></div>
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="wrap">
          <div className="cta-band reveal">
            <h2 className="sec-h">Sovereign by design.</h2>
            <p>No dependency on a foreign wallet, no server that ever sees your Aadhaar XML, and no reason left to hand over more than a single true-or-false answer.</p>
            <div className="hero-cta" style={{ marginBottom: 0 }}>
              <button className="btn primary" onClick={onTryDemo}>Try the demo ↓</button>
              <a className="btn ghost" href="https://github.com/JMadhan1/zkgate" target="_blank" rel="noopener">Explore the repository</a>
            </div>
          </div>

          <div className="disclaimer reveal">
            <b>Prototype status:</b> this is an active hackathon/research prototype, not a production
            system. The zero-knowledge layer is real, tested cryptography end-to-end. The trusted
            setup is currently single-party (not production-grade), and the issuer-credential model
            verifies a registered issuer's signature rather than UIDAI's signature directly — see{" "}
            <code>docs/UIDAI_INTEGRATION.md</code> for the exact, honest status.
          </div>
        </div>
      </section>
    </>
  );
}
