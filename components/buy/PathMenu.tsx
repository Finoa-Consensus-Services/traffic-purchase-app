"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PathMode } from "@/hooks/useTrafficPurchase";

const OPTIONS: { value: PathMode; label: string; hint?: string }[] = [
  { value: "token-standard", label: "Token transfer", hint: "Default" },
  { value: "legacy", label: "Legacy BuyMemberTraffic" },
];

export function PathMenu({
  value,
  onChange,
}: {
  value: PathMode;
  onChange: (value: PathMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const labelId = useId();
  const current = OPTIONS.find((option) => option.value === value) ?? OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <p id={labelId} className="text-sm font-bold">
        Purchase path
      </p>
      <button
        type="button"
        className="mt-2 flex h-12 w-full items-center justify-between rounded-md border border-line bg-surface px-3 text-left text-sm font-bold tracking-tight text-primary"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate">{current.label}</span>
          {current.hint ? <span className="text-xs font-medium text-ink-muted">{current.hint}</span> : null}
        </span>
        <svg className={`h-2 w-3 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`} viewBox="0 0 12 8" aria-hidden="true">
          <path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <ul
        id={listId}
        role="listbox"
        aria-label="Purchase path"
        className={`absolute inset-x-0 top-[calc(100%+0.35rem)] z-30 rounded-md border border-line bg-surface p-1 bar-shadow transition duration-150 ease-out ${open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"}`}
      >
        {OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-sm px-3 text-left text-sm font-bold tracking-tight ${selected ? "bg-accent text-white" : "text-primary hover:bg-surface-sunken"}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {option.hint ? (
                  <span className={`text-xs font-medium ${selected ? "text-white/80" : "text-ink-muted"}`}>{option.hint}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
