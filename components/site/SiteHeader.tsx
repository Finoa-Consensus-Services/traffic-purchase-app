"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const home = usePathname() === "/";
  return (
    <header className={home ? "absolute inset-x-0 top-[var(--banner-h,0px)] z-10" : "border-b border-line bg-surface"}>
      <div className="mx-auto flex min-h-[72px] w-[min(68rem,calc(100%-2rem))] flex-wrap items-center justify-between gap-2">
        <Link
          href="/"
          className={`font-bold tracking-tight no-underline ${home ? "text-white" : "text-primary"}`}
        >
          Validator Traffic
        </Link>
        <nav className="flex items-center gap-2" aria-label="Site">
          <Link
            href="/faq"
            className={`text-sm font-bold tracking-tight no-underline ${home ? "text-white" : "text-primary hover:text-accent-strong"}`}
          >
            FAQ
          </Link>
          <Link
            href="/buy"
            className="inline-flex h-12 items-center rounded-full bg-accent px-5 text-sm font-bold tracking-tight text-white no-underline hover:bg-accent-strong"
          >
            Open app
          </Link>
        </nav>
      </div>
    </header>
  );
}
