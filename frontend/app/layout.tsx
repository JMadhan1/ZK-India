import type { Metadata } from "next";
import { Chakra_Petch, Inter } from "next/font/google";
import "./globals.css";
import { ThemeToggle } from "@/components/ThemeToggle";

// Chakra Petch — bold, condensed, technical: doubles as a nod to the
// Prabhat/Chakra theme names and gives headlines a distinct identity from
// body text, rather than one system font doing both jobs.
const chakraPetch = Chakra_Petch({
  subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "ZKGate — Prove who you are, reveal nothing",
  description:
    "The indigenous Zero-Knowledge Identity Layer. Prove your age, residency, or citizenship without disclosing any personal data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${chakraPetch.variable} ${inter.variable}`}>
        <svg className="grain" xmlns="http://www.w3.org/2000/svg">
          <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" /></filter>
          <rect width="100%" height="100%" filter="url(#n)" />
        </svg>
        <div className="aurora"><div className="blob blob1" /><div className="blob blob2" /><div className="blob blob3" /></div>
        <div className="tri-hairline" />

        <nav className="topbar">
          <div className="wrap">
            <span className="brand">
              ZK<span className="chakra">Gate</span>
            </span>
            <div className="navlinks">
              <a href="#problem">Problem</a>
              <a href="#how">How it works</a>
              <a href="#claims">Claims</a>
              <a href="#compare">Comparison</a>
              <a href="#architecture">Architecture</a>
            </div>
            <div className="navcta">
              <ThemeToggle />
              <a className="btn ghost" href="https://github.com/JMadhan1/zkgate" target="_blank" rel="noopener">GitHub</a>
            </div>
          </div>
        </nav>

        {children}

        <footer className="site-footer">
          <div className="wrap">
            <div className="fmuted">Your Aadhaar XML never leaves this device. Only a mathematical proof is shared. · zkgate.net</div>
          </div>
        </footer>
      </body>
    </html>
  );
}
