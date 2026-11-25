"use client";

import { useLayoutEffect, useRef } from "react";

export const DevnetBanner = () => {
  const bannerRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const banner = bannerRef.current;
    if (!banner) return;

    const applyHeight = () => {
      document.documentElement.style.setProperty("--banner-h", `${banner.offsetHeight}px`);
    };

    applyHeight();
    const observer = new ResizeObserver(applyHeight);
    observer.observe(banner);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--banner-h");
    };
  }, []);

  return (
    <p
      ref={bannerRef}
      className="sticky top-0 z-50 flex min-h-11 items-center justify-center bg-primary-deep px-4 py-2 text-center text-sm leading-snug font-bold text-white"
      role="note"
    >
      Devnet: testing only. Connect a Devnet wallet. Purchases here have no value.
    </p>
  );
};
