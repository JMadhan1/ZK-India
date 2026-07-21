"""
Generate synthetic Aadhaar-format XMLs for testing.

These are NOT real Aadhaar documents and carry NO valid UIDAI signature.
They exist so the circuits, backend and portals can be exercised without
anyone having to hand over a real identity document.

In production a citizen downloads their own Offline eKYC XML from
https://myaadhaar.uidai.gov.in/ and never uploads it anywhere — it is parsed
in their browser and only the resulting ZK proof leaves the device.

Usage:
    python generate_test_xml.py            # writes test_citizen_1..N.xml here
    python generate_test_xml.py --list     # print the built-in cases
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

OUT_DIR = Path(__file__).parent

# 1x1 transparent PNG — stands in for the citizen photo the real XML carries.
PLACEHOLDER_PHOTO = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
    "+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


def generate_test_xml(
    name: str = "Test Citizen",
    dob: str = "01-01-1998",
    gender: str = "M",
    state: str = "Andhra Pradesh",
    district: str = "Chittoor",
    pincode: str = "517001",
    house: str = "12/4",
    street: str = "MG Road",
    locality: str = "Ganesh Nagar",
    vtc: str = "Chittoor",
    subdist: str = "Chittoor",
    po: str = "Chittoor HO",
    uid_last4: str = "0001",
) -> str:
    """Build a synthetic Aadhaar Offline eKYC XML matching UIDAI's element layout."""
    ts = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    ref_id = f"xxxx{int(datetime.now().timestamp())}"

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<OfflinePaperlessKyc referenceId="{ref_id}" ts="{ts}" ver="1.0">
  <UidData uid="xxxx-xxxx-{uid_last4}">
    <Poi dob="{dob}" gender="{gender}" name="{name}"/>
    <Poa co="S/O Parent Name" dist="{district}" house="{house}"
         lm="Near Main Road" loc="{locality}"
         pc="{pincode}" po="{po}"
         state="{state}" street="{street}"
         subdist="{subdist}" vtc="{vtc}"/>
    <Pht>{PLACEHOLDER_PHOTO}</Pht>
  </UidData>
  <Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
    <ds:SignedInfo>
      <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
      <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
    </ds:SignedInfo>
    <ds:SignatureValue>DEMO_SYNTHETIC_SIGNATURE_NOT_A_REAL_UIDAI_SIGNATURE</ds:SignatureValue>
  </Signature>
</OfflinePaperlessKyc>"""


TEST_CASES = [
    {
        "name": "Madhan Kumar",
        "dob": "10-07-1998",
        "gender": "M",
        "state": "Andhra Pradesh",
        "district": "Chittoor",
        "pincode": "517001",
        "vtc": "Chittoor",
        "subdist": "Chittoor",
        "po": "Chittoor HO",
        "uid_last4": "3632",
        "_note": "Adult, AP resident. The happy path for every demo.",
    },
    {
        "name": "Priya Sharma",
        "dob": "15-03-2000",
        "gender": "F",
        "state": "Maharashtra",
        "district": "Mumbai",
        "pincode": "400001",
        "vtc": "Mumbai",
        "subdist": "Mumbai",
        "po": "Fort HO",
        "uid_last4": "8814",
        "_note": "Adult, but NOT an AP resident — must fail an AP-only location proof.",
    },
    {
        "name": "Ravi Singh",
        "dob": "20-12-1990",
        "gender": "M",
        "state": "Delhi",
        "district": "New Delhi",
        "pincode": "110001",
        "vtc": "New Delhi",
        "subdist": "New Delhi",
        "po": "Connaught Place",
        "uid_last4": "2277",
        "_note": "Adult, Delhi. Over 21 as well — exercises the age_above_21 claim.",
    },
    {
        "name": "Minor Test",
        "dob": "01-01-2015",
        "gender": "F",
        "state": "Tamil Nadu",
        "district": "Chennai",
        "pincode": "600001",
        "vtc": "Chennai",
        "subdist": "Chennai",
        "po": "Chennai GPO",
        "uid_last4": "9903",
        "_note": "Under 18 — the age circuit must refuse to produce a proof at all.",
    },
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", action="store_true", help="print the built-in cases and exit")
    args = parser.parse_args()

    if args.list:
        for i, case in enumerate(TEST_CASES, 1):
            print(f"{i}. {case['name']:<14} dob={case['dob']}  {case['state']:<16} {case['_note']}")
        return 0

    for i, case in enumerate(TEST_CASES, 1):
        fields = {k: v for k, v in case.items() if not k.startswith("_")}
        xml = generate_test_xml(**fields)
        path = OUT_DIR / f"test_citizen_{i}.xml"
        path.write_text(xml, encoding="utf-8")
        print(f"Generated {path.name} for {case['name']} — {case['_note']}")

    print("\nTest XMLs generated. Feed them to the citizen portal or circuit tests.")
    print("For a real demo the citizen downloads their own XML from uidai.gov.in.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
