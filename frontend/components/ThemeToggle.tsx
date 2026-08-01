"use client";

import { useEffect, useState } from "react";

// "Prabhat" (dawn, light) and "Chakra" (night, dark) — named after the two
// halves of the Ashoka Chakra motif this design already leans on elsewhere.
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = localStorage.getItem("zkgate-theme") as "light" | "dark" | null;
    const initial = stored || "light";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("zkgate-theme", next);
  }

  const isLight = theme === "light";
  return (
    <div className="theme-switch">
      <span className="theme-name">{isLight ? "Prabhat" : "Chakra"}</span>
      <button
        className="theme-toggle"
        onClick={toggle}
        aria-label={isLight ? "Switch to Chakra (dark theme)" : "Switch to Prabhat (light theme)"}
      >
        {isLight ? "☀️" : "🌙"}
      </button>
    </div>
  );
}
