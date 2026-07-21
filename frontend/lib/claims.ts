// The claims a citizen can choose to prove, and what each one discloses.
// `reveals` is the honest list of what the verifier learns — the selling point
// of the whole system is how short these lists are.

export type ClaimDef = {
  id: string;
  label: string;
  circuit: string;
  blurb: string;
  reveals: string[];
  hidden: string[]; // things a traditional ID check would have exposed
};

export const CLAIMS: ClaimDef[] = [
  {
    id: "age_above_18",
    label: "I am 18 or older",
    circuit: "age_proof",
    blurb: "For age-gated services — SIM cards, gaming, alcohol, voting rolls.",
    reveals: ["That your age is ≥ 18"],
    hidden: ["Date of birth", "Exact age", "Name", "Address", "Aadhaar number", "Photo"],
  },
  {
    id: "age_above_21",
    label: "I am 21 or older",
    circuit: "age_proof",
    blurb: "For services with a 21+ threshold.",
    reveals: ["That your age is ≥ 21"],
    hidden: ["Date of birth", "Exact age", "Name", "Address", "Aadhaar number"],
  },
  {
    id: "age_above_60",
    label: "I am a senior citizen (60+)",
    circuit: "age_proof",
    blurb: "For senior-citizen concessions and schemes.",
    reveals: ["That your age is ≥ 60"],
    hidden: ["Date of birth", "Exact age", "Name", "Address"],
  },
  {
    id: "india_citizen",
    label: "I hold a valid Aadhaar",
    circuit: "citizenship_proof",
    blurb: "Proves you have a UIDAI-signed Aadhaar — nothing else at all.",
    reveals: ["That a UIDAI-signed Aadhaar exists"],
    hidden: ["Name", "Date of birth", "Address", "Gender", "Aadhaar number", "Photo"],
  },
  {
    id: "state_resident",
    label: "I live in a particular state",
    circuit: "location_proof",
    blurb: "Proves your state of residence without your street address.",
    reveals: ["Your state (only)"],
    hidden: ["House / street", "Pincode", "District", "Name", "Date of birth"],
  },
  {
    id: "compound_kyc",
    label: "Full KYC (citizen + 18+ + state) in one proof",
    circuit: "compound_proof",
    blurb: "One proof for bank onboarding: valid Aadhaar, adult, and resident.",
    reveals: ["Valid Aadhaar", "Age ≥ 18", "Your state"],
    hidden: ["Date of birth", "Exact age", "Full address", "Pincode", "Name", "Aadhaar number"],
  },
];

export function claimById(id: string): ClaimDef | undefined {
  return CLAIMS.find((c) => c.id === id);
}
