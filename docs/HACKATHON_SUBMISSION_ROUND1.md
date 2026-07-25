# Round 1 Submission Draft — Sovereign Technology for India (TechGig)

Deadline: Aug 17, 2026. This is draft content for the presentation deck —
edit freely, this is a starting point, not final copy. Every factual claim
below is traceable to research done earlier in this project; do not add new
numbers without a source.

**Before submitting, resolve two open items (see bottom of this doc):**
1. Whether "Perceive / Execute / Reason" (AI-systems framing) applies to the
   Indigenous Innovation & Technology Sovereignty track, or is generic
   template language.
2. Whether prior development work is permitted under "code created during
   the hackathon."

---

## Elevator Pitch

> Every year, Indians lose thousands of crores to scams built on one lie:
> "share your Aadhaar to prove who you are." ZKGate India makes that lie
> unnecessary. It's a zero-knowledge proof layer over Aadhaar's own offline
> eKYC data — built entirely in India — that lets a citizen prove a single
> fact ("I'm over 18," "I live in this state," "I hold a valid Aadhaar")
> without ever handing over their date of birth, address, photo, or Aadhaar
> number to anyone. Not a masked copy. Not a selective share. A mathematical
> proof that reveals nothing else, verified in milliseconds, sovereign
> end-to-end — no dependency on a foreign wallet or platform to work.

## Problem Statement

India's identity ecosystem still runs on over-disclosure. Proving a single
fact about yourself — that you're an adult, that you live somewhere, that
you hold a valid Aadhaar — routinely means handing over your full identity:
name, DOB, address, photo, and a permanent national identifier, to whoever
is asking. Three concrete, current consequences of that design:

1. **Digital-arrest and KYC-impersonation scams** are now India's most
   damaging live cyber-fraud pattern — an estimated **₹22,495 crore
   (~$2.7B) lost in 2025 alone**, over 30,000 formal complaints, serious
   enough that the Prime Minister personally warned citizens about it on
   Mann Ki Baat. The scam's entire mechanism depends on citizens believing
   sharing Aadhaar/PAN details is a normal verification step.
2. **KYC data breaches from third-party vendors are systemic**: a major
   fintech had 7.9 million KYC records (Aadhaar, PAN, documents) sold on
   the dark web in January 2025; a separate incident (FatakPay) exposed
   KYC data via a misconfigured cloud bucket. Security researchers describe
   the aggregation ecosystem itself — banks, vendors, fintechs all holding
   copies of the same document — as the vulnerability.
3. **The DPDP Rules 2025 create a hard, dated compliance forcing-function**:
   gaming, social media, and e-commerce platforms must implement verifiable
   age/parental-consent checks for under-18 users, with obligations
   enforceable **13 May 2027**. Every affected platform now needs an
   age-verification mechanism — and the obvious approach (collect and store
   more identity data to prove age) recreates the exact breach risk in (2).

## Technology Differentiation

Zero-knowledge proof of an Aadhaar-derived fact is not a new idea — but
almost every existing implementation stops at **selective disclosure**
(reveal fewer fields, but still the real value), not **true zero-knowledge**
(reveal only a boolean answer, never the underlying value). This project was
benchmarked directly against every real system in this space as of mid-2026:

| System | What it does | Gap vs. this project |
|---|---|---|
| UIDAI's new Aadhaar App (40M+ downloads, Jan 2026) | Official selective disclosure — shares chosen field *values* (e.g., real age) | Not zero-knowledge; still discloses the actual value |
| Google Wallet Aadhaar Verifiable Credentials (Apr 2026) | ISO 18013-5 mdoc selective disclosure | Same limitation; also depends on a foreign platform's wallet infrastructure |
| Anon Aadhaar (Ethereum Foundation / PSE) | True ZK over the printed Aadhaar QR code | Explicitly pre-production by its own docs; narrower claim set |
| Self Protocol (self.xyz) | True ZK over Aadhaar, funded, live | Closest peer — a Web3-oriented commercial product, not built as Indian public infrastructure |
| Google's Longfellow ZK library (open-sourced Jul 2025) | Transparent-setup ZK for age predicates over mdoc credentials | A building block, not a deployed Aadhaar-specific system |

This project's distinct position: **true zero-knowledge** (not selective
disclosure), built specifically for the **offline eKYC XML channel**
(OTP-gated, digit-masked, freshly generated — not a static printed QR that
can be photographed and reused without the holder's participation), with a
**deployable verification service** (semantic gate, replay-proof nullifier
registry, tamper-evident audit log) that a bank, ministry, or platform could
actually integrate — not just a circuit and an SDK.

Every technical claim above is independently checked, not asserted — see
`docs/COMPARISON_ANON_AADHAAR.md`, `docs/XML_SIGNATURE_SPIKE.md`, and
`docs/PROVING_SYSTEM_EVALUATION.md` in this repository for the underlying
verification work, including honest documentation of what is not yet solved.

## Impact Metrics

Framed against real, dated numbers rather than hypothetical projections:

- **Addressable fraud exposure**: a share of the ₹22,495 crore lost to
  digital-arrest and KYC-impersonation scams in 2025 is directly attributable
  to citizens believing raw Aadhaar/PAN sharing is a legitimate verification
  step — a proof-based alternative removes the premise the scam depends on.
- **Breach-surface reduction**: verifiers using this system never receive or
  store the underlying document, which structurally rules out the failure
  mode behind the 7.9M-record fintech breach (Jan 2025) and the FatakPay
  leak — there is no copy to steal.
- **Regulatory-deadline market**: every gaming, social media, and e-commerce
  platform operating in India must implement DPDP-compliant age/consent
  verification before **13 May 2027** — a concrete, dated buyer population,
  not a speculative one.
- **Reach ceiling**: Aadhaar covers 1.4 billion enrolments; even the
  offline-eKYC-capable smartphone-owning segment (NSO CMS:T 2025: 85.5% of
  households own a smartphone) represents a market far larger than any
  single vertical use case.

*(If the deck template truly requires carbon/energy/waste metrics per the
"Sustainable & Resilient India" language elsewhere on the hackathon page,
that appears to be reused boilerplate not matching this hackathon's actual
six themes — flag this to organizers rather than fabricating an unrelated
environmental metric.)*

## Theme Alignment — Indigenous Innovation & Technology Sovereignty

The clearest available foreign dependency in this exact space is that the
most visible current solution to "prove a fact about your Aadhaar without
oversharing" is **Google Wallet's Aadhaar Verifiable Credentials** — a
foreign platform's wallet, foreign infrastructure, requiring a Google
account. This project is the sovereign alternative: Indian-built, open,
auditable end-to-end, with no dependency on any non-Indian platform to
function. It directly answers the track's own question — reducing foreign
dependency while building indigenous, secure, scalable technology — for one
of the most sensitive categories of infrastructure a country can have:
citizen identity verification.

## Collaborations

No formal partnerships exist yet — stated honestly rather than implied.
Realistic near-term targets, to be pursued before Round 2/3, not claimed as
existing:

- **MeitY–NeGD's "Code for Consent" DPDP Innovation Challenge** ecosystem —
  a live, existing government-run track for exactly this category of
  privacy-tech (a prior round was won by IDfy); worth applying to or citing
  as the intended engagement path.
- **An academic cryptography lab** (e.g., IIT Bombay, which has published
  directly relevant Aadhaar-ZK research) as a technical reviewer/co-author
  for the trusted-setup ceremony this project's own roadmap already calls
  for.
- **One pilot integration partner** — a single NBFC, gaming platform, or
  e-commerce verifier willing to test the age/KYC claim flow — is the
  single highest-value thing to secure before Round 2, since "here's a real
  integration in progress" is a materially stronger submission than a
  standalone demo.

## Scalability

See `EXECUTION_PLAN.md` in this repository for the concrete, already-partly-
executed roadmap: closing the signature-verification gap across all claim
types (done), an evidence-based path to full in-circuit UIDAI verification
over the offline-XML channel (spiked, scoped), a proving-system decision for
future circuits, and a documented multi-party trusted-setup plan. This is
not a one-off hackathon demo architecture — it's built to the standard a
real verifier-service deployment would need.

---

## Open items to resolve before final submission

1. **Ask TechGig directly** (can be the same email already drafted) whether
   "Perceive / Execute / Reason" / "real-world AI systems" framing is meant
   to apply to every track, or is generic hackathon-page template language
   that doesn't constrain a non-AI, cryptography-based sovereignty
   submission.
2. **Resolve the "code created during the hackathon" question** before
   Round 2 — see the draft email already prepared for this.
3. **Record the demo video (max 4 min)** once the pitch framing above is
   finalized — script it around the digital-arrest-scam scenario, since
   it's the most viscerally understandable entry point for a judge with 4
   minutes.
4. **Pursue at least one real collaboration** (see above) before Round 2 —
   this is the weakest deliverable right now and the one most likely to
   separate this submission from others with similar technical depth.
