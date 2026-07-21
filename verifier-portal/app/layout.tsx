import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZKGate India — Verifier Portal",
  description: "Request and verify zero-knowledge identity proofs from citizens.",
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
            <span className="tag">Verifier Portal · for banks & institutions</span>
          </div>
        </header>
        {children}
        <div className="footer container">
          You receive only the claim. No personal data is ever transmitted to you.
        </div>
      </body>
    </html>
  );
}
