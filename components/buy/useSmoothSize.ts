"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

const EASE = "0.35s cubic-bezier(0.2, 0.7, 0.2, 1)";

function release(el: HTMLElement) {
  el.style.height = "";
  el.style.overflow = "";
  el.style.transition = "";
}

/** Ease a window's height when its content changes size. Width stays put. */
export function useSmoothSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const size = useRef<number | null>(null);
  const animating = useRef(false);
  const fallback = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || animating.current) return;
    if (el.getClientRects().length === 0) return;

    const next = el.offsetHeight;
    const prev = size.current;
    size.current = next;
    if (prev === null) return;

    const heightChanged = Math.abs(prev - next) > 1;
    if (!heightChanged) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const finish = () => {
      if (fallback.current !== null) {
        window.clearTimeout(fallback.current);
        fallback.current = null;
      }
      release(el);
      el.scrollTop = 0;
      animating.current = false;
      if (el.getClientRects().length > 0) {
        size.current = el.offsetHeight;
      }
    };

    animating.current = true;
    el.style.overflow = "hidden";
    el.scrollTop = 0;
    el.style.height = `${prev}px`;

    let frame = requestAnimationFrame(() => {
      frame = 0;
      el.style.transition = `height ${EASE}`;
      el.style.height = `${next}px`;
      el.scrollTop = 0;
    });

    const clear = (event: TransitionEvent) => {
      if (event.target !== el || event.propertyName !== "height") return;
      el.removeEventListener("transitionend", clear);
      if (frame) cancelAnimationFrame(frame);
      finish();
    };
    el.addEventListener("transitionend", clear);
    fallback.current = window.setTimeout(() => {
      el.removeEventListener("transitionend", clear);
      if (frame) cancelAnimationFrame(frame);
      finish();
    }, 500);
  });

  useEffect(() => {
    return () => {
      if (fallback.current !== null) {
        window.clearTimeout(fallback.current);
        fallback.current = null;
      }
      const el = ref.current;
      if (!el) return;
      release(el);
      animating.current = false;
    };
  }, []);

  return ref;
}
