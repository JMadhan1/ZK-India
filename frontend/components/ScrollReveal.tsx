"use client";

import { useEffect } from "react";

/** Mounts once and fades/slides in every `.reveal` element as it enters the
 *  viewport, and count-up-animates every `.num[data-count]` stat. Renders
 *  nothing itself — drop it anywhere inside the page that has `.reveal`
 *  elements below it. */
export function ScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("in"));
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("in");
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15 },
      );
      els.forEach((e) => io.observe(e));
    }

    const nums = document.querySelectorAll<HTMLElement>(".num[data-count]");
    const done = new WeakSet<Element>();
    function animate(el: HTMLElement) {
      const target = parseFloat(el.getAttribute("data-count") || "0");
      const prefix = el.getAttribute("data-prefix") || "";
      const suffix = el.getAttribute("data-suffix") || "";
      const decimals = (el.getAttribute("data-count")?.split(".")[1] || "").length;
      const start = performance.now();
      const dur = 1400;
      function tick(now: number) {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = target * eased;
        el.textContent = prefix + val.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
    if (!("IntersectionObserver" in window)) {
      nums.forEach(animate);
    } else {
      const io2 = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !done.has(entry.target)) {
              done.add(entry.target);
              animate(entry.target as HTMLElement);
              io2.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.4 },
      );
      nums.forEach((n) => io2.observe(n));
    }
  }, []);

  return null;
}
