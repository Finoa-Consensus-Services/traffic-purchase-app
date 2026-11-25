"use client";

import { useEffect, useId, useRef, useState } from "react";

export function NetworkMenu({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const label = value || "Network";

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
      <button
        type="button"
        className="inline-flex h-12 max-w-52 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-bold tracking-tight text-primary"
        aria-label="Network"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{label}</span>
        <svg className={`h-2 w-3 ${open ? "rotate-180" : ""}`} viewBox="0 0 12 8" aria-hidden="true">
          <path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Network"
          className="absolute top-[calc(100%+0.5rem)] right-0 z-40 min-w-full rounded-md border border-line bg-surface p-1 bar-shadow"
        >
          {options.map((option) => {
            const selected = option === value;
            return (
              <li key={option}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-sm px-3 text-left text-sm font-bold tracking-tight text-primary ${selected ? "bg-accent-soft" : "hover:bg-surface-sunken"}`}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                >
                  <span className="max-w-64 truncate font-mono">{option}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
