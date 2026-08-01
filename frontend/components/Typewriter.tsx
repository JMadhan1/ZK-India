"use client";

import { useEffect, useState } from "react";

/** Types out `lines` one character at a time (45ms/char, matching the spec),
 *  holding a blinking cursor for 1.2s after the last line finishes, then
 *  hiding it. Renders plain text — the caller supplies markup/gradient
 *  spans around it if needed via `render`. */
export function Typewriter({ lines }: { lines: string[] }) {
  const full = lines.join("\n");
  const [shown, setShown] = useState(0);
  const [cursorOn, setCursorOn] = useState(true);

  useEffect(() => {
    if (shown >= full.length) {
      const t = setTimeout(() => setCursorOn(false), 1200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown((n) => n + 1), 45);
    return () => clearTimeout(t);
  }, [shown, full.length]);

  const text = full.slice(0, shown);
  const renderedLines = text.split("\n");

  return (
    <>
      {renderedLines.map((line, i) => (
        <span key={i}>
          {i === 1 ? <span className="grad">{line}</span> : line}
          {i < renderedLines.length - 1 && <br />}
        </span>
      ))}
      {cursorOn && <span className="typewriter-cursor">|</span>}
    </>
  );
}
