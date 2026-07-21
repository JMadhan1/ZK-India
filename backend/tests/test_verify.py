"""End-to-end API tests over real proofs."""

from __future__ import annotations

from tests.conftest import bundle


def test_health_ready(client):
    r = client.get("/health").json()
    assert r["status"] == "ready"
    assert "age_proof" in r["circuits_loaded"]


def test_valid_age_proof(client, proofs):
    r = client.post("/v1/verify", json=bundle(proofs["age18"], "age_above_18")).json()
    assert r["valid"] is True
    assert r["fresh"] is True
    assert r["claims"]["age_above_18"] is True
    assert r["nullifier"]
    # The response carries no personal data — assert the DOB isn't hiding in it.
    assert "1998" not in str(r["claims"])


def test_replay_is_rejected(client, proofs):
    b = bundle(proofs["age18"], "age_above_18")
    first = client.post("/v1/verify", json=b).json()
    assert first["valid"] is True and first["fresh"] is True

    second = client.post("/v1/verify", json=b).json()
    assert second["valid"] is False
    assert second["fresh"] is False
    assert "replay" in second["error"].lower()


def test_18_proof_cannot_satisfy_21(client, proofs):
    # The crypto is valid, but the claim is wrong. Must be refused.
    r = client.post("/v1/verify", json=bundle(proofs["age18"], "age_above_21")).json()
    assert r["valid"] is False
    assert "age>=21" in r["error"]


def test_21_proof_satisfies_both(client, proofs):
    r18 = client.post("/v1/verify", json=bundle(proofs["age21"], "age_above_18")).json()
    assert r18["valid"] is True
    # A different claim_type => different registry slot, so not a replay.
    r21 = client.post("/v1/verify", json=bundle(proofs["age21"], "age_above_21")).json()
    assert r21["valid"] is True


def test_location_reveals_only_state(client, proofs):
    r = client.post(
        "/v1/verify",
        json=bundle(proofs["locAP"], "state_resident", expected={"required_state_code": 28}),
    ).json()
    assert r["valid"] is True
    assert r["claims"]["state_code"] == 28
    assert r["claims"]["state_name"] == "Andhra Pradesh"
    # pincode/district must not appear.
    assert "517001" not in str(r["claims"])


def test_location_wrong_expected_state_rejected(client, proofs):
    # Proof is bound to state 28; verifier claims they asked for 27.
    r = client.post(
        "/v1/verify",
        json=bundle(proofs["locAP"], "state_resident", expected={"required_state_code": 27}),
    ).json()
    assert r["valid"] is False


def test_citizenship(client, proofs):
    r = client.post("/v1/verify", json=bundle(proofs["citizen"], "india_citizen")).json()
    assert r["valid"] is True
    assert r["claims"]["india_citizen"] is True


def test_compound_kyc(client, proofs):
    r = client.post(
        "/v1/verify",
        json=bundle(
            proofs["kyc"], "compound_kyc",
            expected={"age_threshold": 18, "required_state_code": 28},
        ),
    ).json()
    assert r["valid"] is True
    assert r["claims"]["compound_kyc"] is True
    assert r["claims"]["india_citizen"] is True
    assert r["claims"]["state_name"] == "Andhra Pradesh"


def test_tampered_signal_rejected(client, proofs):
    b = bundle(proofs["age18"], "age_above_18")
    b["proof_bundle"]["public_signals"] = list(b["proof_bundle"]["public_signals"])
    b["proof_bundle"]["public_signals"][0] = "0"  # flip is_valid
    r = client.post("/v1/verify", json=b).json()
    assert r["valid"] is False


def test_demo_flag_surfaces_as_trust_level(client, proofs):
    demo = client.post("/v1/verify", json=bundle(proofs["citizen"], "india_citizen", demo=True)).json()
    assert demo["trust_level"] == "demo"


def test_audit_chain_intact_after_traffic(client, proofs):
    client.post("/v1/verify", json=bundle(proofs["age18"], "age_above_18"))
    client.post("/v1/verify", json=bundle(proofs["citizen"], "india_citizen"))
    audit = client.get("/v1/audit").json()
    assert audit["chain_intact"] is True
    assert audit["count"] >= 2


def test_stats_counts_replays(client, proofs):
    b = bundle(proofs["age18"], "age_above_18")
    client.post("/v1/verify", json=b)
    client.post("/v1/verify", json=b)  # replay
    stats = client.get("/v1/stats").json()
    assert stats["verified"] >= 1
    assert stats["replay"] >= 1
