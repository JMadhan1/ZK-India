// circomlibjs ships no type declarations. This is only used client-side in
// lib/prove.ts's demo issuer-credential signer; an ambient `any`-typed
// module is sufficient — no need for a full type surface for a demo-only
// dependency.
declare module "circomlibjs";
