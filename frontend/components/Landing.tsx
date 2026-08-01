"use client";

import { useState } from "react";
import { ScrollReveal } from "@/components/ScrollReveal";
import { Typewriter } from "@/components/Typewriter";

const REAL_WORLD_SCENES = [
  { k: "SIM shop", v: "Verified: Age 18+", icon: "📱" },
  { k: "Bank counter", v: "KYC Verified ✓", icon: "🏦" },
  { k: "Bar", v: "Age 21+ Verified", icon: "🌙" },
  { k: "Online", v: "Prove you are 18+ → Done", icon: "💻" },
];

const PROBLEM_TABS = [
  {
    id: "fraud", label: "Digital Arrest Scams",
    numDisplay: "₹22,495 Cr",
    lbl: "Lost to cyber fraud in India in 2025, much of it built on \"digital arrest\" scams that rely on citizens believing sharing Aadhaar/PAN is a normal verification step.",
    src: "Source: 2025 cyber-fraud reporting, PIB alerts",
  },
  {
    id: "leaks", label: "KYC Data Leaks",
    numDisplay: "7.9M+",
    lbl: "KYC records (Aadhaar, PAN, documents) leaked from a single compromised fintech vendor in January 2025 — a systemic risk of aggregating full documents.",
    src: "Source: dark-web breach reporting, Jan 2025",
  },
  {
    id: "dpdp", label: "DPDP Deadline",
    numDisplay: "13 May 2027",
    lbl: "DPDP Act deadline by which every gaming, social, and e-commerce platform in India must implement verifiable age/parental-consent checks — without creating a new data liability.",
    src: "Source: DPDP Rules, notified Nov 2025",
  },
];

const HOW_STEPS = [
  { n: "01", h: "Get the offline eKYC XML", b: <>The citizen downloads their own UIDAI offline eKYC XML — OTP-gated, digit-masked, with a fresh rotating reference ID each time. It never touches any server in this system.</> },
  { n: "02", h: "Parse entirely in the browser", b: <><code>sdk/src/aadhaar.js</code> parses the XML client-side — DOB, state, pincode, signature block — and it stays in memory on the citizen's device only.</> },
  { n: "03", h: "Derive a secret & build the witness", b: <>A Poseidon hash derives a private <code>aadhaar_secret</code>. The SDK assembles the private witness — DOB, state, secret, issuer-signed credential — for exactly the claim being proven.</> },
  { n: "04", h: "Generate the proof, on-device", b: <><code>snarkjs.groth16.fullProve</code> runs the Circom circuit locally (wasm + proving key fetched as static assets) and outputs a ~800-byte Groth16 proof plus its public signals.</> },
  { n: "05", h: "Send only the proof", b: <>The proof and public signals — never the XML, never the DOB, never the Aadhaar number — go to the verifier's <code>POST /v1/verify</code> endpoint.</> },
  { n: "06", h: "Four checks on the backend", b: <>
      <b>Pairing check</b> — an independent Python Groth16 verifier, cross-checked against snarkjs, rejects tampered proofs and off-curve points.<br />
      <b>Semantic gate</b> — do the public signals actually answer what the verifier asked (an age≥18 proof can't satisfy an age≥21 request)?<br />
      <b>Nullifier registry</b> — <code>Poseidon(secret, verifier_id, expiry)</code> catches replay, first-use-wins, per <code>(claim_type, nullifier)</code>.<br />
      <b>Audit chain</b> — every verification is written to a hash-chained log; tampering with history is detectable.
    </> },
  { n: "07", h: "Verifier gets a verdict, nothing else", b: <>The response is <code>{"{ valid, claims, nullifier, trust_level }"}</code> — e.g. <code>{'{"age_above_18": true}'}</code>. No name, no DOB, no address, no Aadhaar number was ever transmitted or stored.</> },
];

export function Landing({ onTryDemo }: { onTryDemo: () => void }) {
  const [activeProblem, setActiveProblem] = useState(0);

  return (
    <>
      <ScrollReveal />

      <header className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <div className="badge">🇮🇳 Built for Sovereign Technology for India</div>
            <h1>
              <Typewriter lines={["Prove who you are.", "Reveal nothing."]} />
            </h1>
            <p className="hero-sub">
              ZKGate is India's sovereign zero-knowledge identity layer. Prove age,
              residency, or a valid Aadhaar with an ~800-byte cryptographic proof.
              Zero personal data ever leaves your device.
            </p>
            <div className="hero-cta">
              <button className="btn primary" onClick={onTryDemo}>Try live demo →</button>
              <a className="btn ghost" href="#watch">Watch 30-sec walkthrough</a>
            </div>
            <div className="trust-line">
              Prototype · Offline eKYC XML · Groth16 · Built for India 🇮🇳
            </div>
          </div>

          <div className="hero-mockup" aria-hidden="true">
            <div className="phone-mockup">
              <div className="phone-notch" />
              <div className="phone-glow" />
              <div className="phone-screen">
                <div className="phone-brand">ZK<span>Gate</span></div>
                <div className="phone-check">✓</div>
                <div className="phone-check-label">Age 18+ Verified</div>
              </div>
            </div>
          </div>
        </div>

        <div className="wrap">
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

      <section className="lp-sec lp-sec-wash" id="problem">
        <div className="wrap">
          <div className="eyebrow reveal">Why this exists</div>
          <h2 className="sec-h reveal">India's identity ecosystem runs on over-disclosure</h2>
          <p className="lede reveal">
            Proving one fact about yourself in India usually means handing over your entire
            identity. That design choice has a real, current cost — pick a problem to see it.
          </p>

          <div className="pill-tabs reveal">
            {PROBLEM_TABS.map((t, i) => (
              <button
                key={t.id}
                className={`pill-tab${activeProblem === i ? " active" : ""}`}
                onClick={() => setActiveProblem(i)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="stat reveal" style={{ maxWidth: 640 }}>
            {/* Plain text, not the count-up .num[data-count] treatment: that
                animation only scans the DOM once on mount (see
                ScrollReveal.tsx), so it can't re-trigger when a tab swaps in
                a new number after the fact — showing the frozen placeholder
                instead of the real value. The other stat cards, which never
                change after mount, still use the animated version. */}
            <div className="num">{PROBLEM_TABS[activeProblem].numDisplay}</div>
            <div className="lbl">{PROBLEM_TABS[activeProblem].lbl}</div>
            <div className="src">{PROBLEM_TABS[activeProblem].src}</div>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="watch">
        <div className="wrap">
          <div className="eyebrow reveal">See it in the real world</div>
          <h2 className="sec-h reveal">What verification actually looks like</h2>
          <p className="lede reveal">
            A SIM shop, a bar, a bank counter, an online age gate — the same phone screen,
            the same one-word answer, every time. No document ever changes hands.
          </p>
          <div className="video-frame reveal">
            {/* Swap this placeholder for a real <video src="..." controls /> or
                <iframe> once the walkthrough video is ready. */}
            <div className="video-placeholder">
              <div className="play">▶</div>
              <div className="cap">
                <b>Demo video coming soon.</b><br />
                A walkthrough of ZKGate used at a SIM shop, a bar, a bank KYC counter, and an
                online age gate — showing exactly what the other person's screen shows, and
                what it never shows.
              </div>
            </div>
          </div>

          <div className="scene-grid">
            {REAL_WORLD_SCENES.map((s) => (
              <div key={s.k} className="scene-card reveal">
                <div className="scene-icon">{s.icon}</div>
                <div className="scene-k">{s.k}</div>
                <div className="scene-check">✓ {s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec lp-sec-wash" id="how">
        <div className="wrap">
          <div className="eyebrow reveal">How it works</div>
          <h2 className="sec-h reveal">Real cryptography, not a mock</h2>
          <p className="lede reveal">
            Every layer verifies genuine cryptography — the backend's Python Groth16 verifier is
            cross-checked against snarkjs, and the JS/Python encoders are proven byte-identical so
            a proof built in the browser verifies on the server.
          </p>
          <div>
            {HOW_STEPS.map((s) => (
              <div key={s.n} className="numblock reveal">
                <div className="n">{s.n}</div>
                <h3>{s.h}</h3>
                <p>{s.b}</p>
              </div>
            ))}
          </div>

          <div className="grid3" style={{ marginTop: 40 }}>
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

      <section className="lp-sec lp-sec-wash" id="compare">
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
                <tr className="you-row"><td className="you">ZKGate</td><td>Prototype</td><td className="you">True ZK — offline eKYC XML channel</td></tr>
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
