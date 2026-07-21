import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZKGate India — Prove who you are, reveal nothing",
  description:
    "India's first indigenous Zero-Knowledge Identity Layer. Prove your age, residency, or citizenship without disclosing any personal data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="container">
            <span className="brand">
              ZK<span className="chakra">Gate</span> India
            </span>
            <span className="tag">Zero-Knowledge Identity · Citizen Portal</span>
          </div>
        </header>
        {children}
        <div className="footer container">
          Your Aadhaar XML never leaves this device. Only a mathematical proof is
          shared. · A Sovereign Technology for India prototype.
        </div>
      </body>
    </html>
  );
}
