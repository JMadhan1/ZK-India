"""Geography encoding. The parity with the TypeScript encoder is enforced
separately by test_encoding_parity.py; here we check the Python side alone."""

from __future__ import annotations

from services import encoding


def test_known_states():
    assert encoding.encode_state("Andhra Pradesh") == 28
    assert encoding.encode_state("Maharashtra") == 27
    assert encoding.encode_state("Tamil Nadu") == 33


def test_state_aliases_and_case():
    assert encoding.encode_state("TAMILNADU") == 33
    assert encoding.encode_state("Orissa") == encoding.encode_state("Odisha")
    assert encoding.encode_state("NCT of Delhi") == encoding.encode_state("Delhi")
    assert encoding.encode_state("  andhra   pradesh ") == 28


def test_unknown_state_is_zero_not_a_match():
    # Critical: an unknown state must be 0, never accidentally a real code.
    assert encoding.encode_state("Atlantis") == 0
    assert encoding.encode_state("") == 0


def test_state_name_roundtrip():
    for name in ("Andhra Pradesh", "Kerala", "Punjab"):
        assert encoding.state_name(encoding.encode_state(name)) == name


def test_district_is_namespaced_by_state():
    # Same district name in two states must not collide.
    ap = encoding.encode_district(28, "Aurangabad")
    mh = encoding.encode_district(27, "Aurangabad")
    assert ap != mh


def test_district_is_deterministic():
    assert encoding.encode_district(28, "Chittoor") == encoding.encode_district(28, "chittoor ")


def test_pincode():
    assert encoding.encode_pincode("517001") == 517001
    assert encoding.encode_pincode(517001) == 517001
    assert encoding.encode_pincode("51700") == 0   # too short
    assert encoding.encode_pincode("abcdef") == 0
