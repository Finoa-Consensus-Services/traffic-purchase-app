"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

export const PRICE_ESTIMATE_NOTE =
  "Estimated using Canton's protocol CC/USD rate (the median of Super Validator votes recorded on each open mining round, not a market price). Final amounts can shift if a new round opens before execution.";

export const CC_RATE_NOTE =
  "This CC price comes from the current Super Validator round and changes when the next round opens. Buying pauses for the last 10 seconds, then the CC amount updates automatically. The traffic you chose stays the same.";

type EstimateTagProps = {
  className?: string;
};

export const EstimateTag = ({ className = "" }: EstimateTagProps) => (
  <span
    className={`text-xs font-medium tracking-normal text-ink-muted ${className}`.trim()}
  >
    est.
  </span>
);

type PriceEstimateInfoProps = {
  showEst?: boolean;
  align?: "start" | "end";
  className?: string;
  note?: string;
  label?: string;
};

const VIEWPORT_PADDING = 12;

export const PriceEstimateInfo = ({
  showEst = true,
  align = "start",
  className = "",
  note = PRICE_ESTIMATE_NOTE,
  label = "About price estimates",
}: PriceEstimateInfoProps) => {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [focused, setFocused] = useState(false);
  const [shiftX, setShiftX] = useState(0);
  const rootRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();

  const open = hovered || pinned || focused;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setPinned(false);
      setHovered(false);
      setFocused(false);
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPinned(false);
      setHovered(false);
      setFocused(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setShiftX(0);
      return;
    }
    const popover = popoverRef.current;
    if (!popover) return;
    const rect = popover.getBoundingClientRect();
    if (rect.right > window.innerWidth - VIEWPORT_PADDING) {
      setShiftX(window.innerWidth - VIEWPORT_PADDING - rect.right);
      return;
    }
    if (rect.left < VIEWPORT_PADDING) {
      setShiftX(VIEWPORT_PADDING - rect.left);
    }
  }, [open]);

  const handleMouseEnter = () => {
    setHovered(true);
  };

  const handleMouseLeave = () => {
    setHovered(false);
  };

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (pinned) {
      setPinned(false);
      setHovered(false);
      setFocused(false);
      return;
    }
    setPinned(true);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    setPinned(false);
    setHovered(false);
    setFocused(false);
  };

  const handleFocus = () => {
    setFocused(true);
  };

  const handleBlur = (event: React.FocusEvent<HTMLSpanElement>) => {
    if (rootRef.current?.contains(event.relatedTarget as Node | null)) return;
    setFocused(false);
  };

  const alignClass = align === "end" ? "right-0" : "left-0";

  return (
    <span
      ref={rootRef}
      className={`relative inline-flex items-center gap-1 align-baseline ${className}`.trim()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onBlur={handleBlur}
    >
      {showEst ? <EstimateTag /> : null}
      <button
        type="button"
        tabIndex={0}
        aria-label={label}
        aria-expanded={open}
        aria-controls={tooltipId}
        aria-describedby={open ? tooltipId : undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunken hover:text-primary focus-visible:text-primary"
      >
        <svg
          className="size-3.5 shrink-0"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6.75" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M8 7.25V11"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="8" cy="4.9" r="0.85" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <span
          ref={popoverRef}
          id={tooltipId}
          role="tooltip"
          style={shiftX !== 0 ? { transform: `translateX(${shiftX}px)` } : undefined}
          className={`absolute top-full ${alignClass} z-40 w-[min(17.5rem,calc(100vw-1.5rem))] pt-2`}
        >
          <span className="block rounded-md border border-line bg-surface p-3 text-left text-xs leading-relaxed font-medium tracking-normal break-normal whitespace-normal text-ink bar-shadow">
            {note}
          </span>
        </span>
      ) : null}
    </span>
  );
};
