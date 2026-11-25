"use client";

import { useEffect, useId, useRef } from "react";

export type AssemblyMode = "demo" | "wallet" | "submit" | "network" | "done";

const ACCENT = "#2563eb";
const GLOW = "#dbeafe";
const STROKE = "#e8eef6";
const LED = "#9eb0c4";
const DURATION = 1560;
const STAGGER = 360;
const FLOW = STAGGER * 3 + DURATION;
const REST = 680;
const GLOW_HOLD = 1320;
const FADE = 520;
const CYCLE = REST + FLOW + GLOW_HOLD + FADE;
const TOKEN = 16;
const icon = { x: 96, y: 171.3, s: 6.05 };
const clasp = { x: icon.x + 19.4 * icon.s, y: icon.y + 14 * icon.s };
const unit = { x: 430, w: 132, h: 32, gap: 16 };
const stackH = unit.h * 4 + unit.gap * 3;
const stackTop = clasp.y - stackH / 2;
const stroke = 1.75 * icon.s;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;
const easeSoft = (amount: number) => 1 - (1 - amount) ** 3;
const easeInOut = (amount: number) =>
  amount < 0.5 ? 4 * amount ** 3 : 1 - ((-2 * amount + 2) ** 3) / 2;

function mix(start: string, end: string, amount: number) {
  const channel = (hex: string, offset: number) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16);
  const blend = (offset: number) =>
    Math.round(lerp(channel(start, offset), channel(end, offset), amount));
  return `#${[1, 3, 5].map((offset) => blend(offset).toString(16).padStart(2, "0")).join("")}`;
}

const unitY = (index: number) => stackTop + (3 - index) * (unit.h + unit.gap);

type Piece = {
  x?: number;
  y?: number;
  opacity: number;
  stretch?: number;
  fill: number;
};

function pieceAt(index: number, motion: number): Piece {
  const local = motion - index * STAGGER;
  if (local <= 0) return { opacity: 0, fill: 0 };
  if (local >= DURATION) return { opacity: 0, fill: 1 };
  const progress = local / DURATION;
  const travel = easeInOut(progress);
  const fadeIn = progress < 0.1 ? easeSoft(progress / 0.1) : 1;
  const fadeOut = progress > 0.48 ? easeSoft(clamp((progress - 0.48) / 0.22, 0, 1)) : 0;
  return {
    x: lerp(clasp.x + 12, unit.x - TOKEN - 10, travel),
    y: clasp.y - TOKEN / 2,
    opacity: fadeIn * (1 - fadeOut),
    stretch: Math.sin(clamp(progress / 0.72, 0, 1) * Math.PI),
    fill: easeSoft(clamp((progress - 0.5) / 0.42, 0, 1)),
  };
}

function sceneAt(mode: AssemblyMode, elapsed: number, reduce: boolean) {
  if (mode === "done" || reduce) {
    return { fills: [1, 1, 1, 1], pieces: [] as Piece[], clasp: 0.35, glow: 1 };
  }
  const time = elapsed % CYCLE;
  if (time < REST) {
    const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(elapsed / 360));
    return { fills: [0, 0, 0, 0], pieces: [] as Piece[], clasp: pulse, glow: 0 };
  }
  if (time >= REST + FLOW + GLOW_HOLD) {
    const fade = easeSoft(clamp((time - REST - FLOW - GLOW_HOLD) / FADE, 0, 1));
    const level = 1 - fade;
    return {
      fills: [level, level, level, level],
      pieces: [] as Piece[],
      clasp: lerp(0.35, 1, fade),
      glow: level,
    };
  }
  if (time >= REST + FLOW) {
    return { fills: [1, 1, 1, 1], pieces: [] as Piece[], clasp: 0.35, glow: 1 };
  }
  const motion = time - REST;
  const pieces: Piece[] = [];
  const fills = [0, 1, 2, 3].map((index) => {
    const piece = pieceAt(index, motion);
    if (piece.opacity > 0.03) pieces.push(piece);
    return piece.fill;
  });
  const level = Math.min(...fills);
  return { fills, pieces, clasp: 1, glow: easeSoft(clamp((level - 0.86) / 0.14, 0, 1)) };
}

function markup(scene: ReturnType<typeof sceneAt>, filterId: string) {
  const ink = mix(STROKE, GLOW, scene.glow * 0.55);
  const bars: string[] = [];
  const faces: string[] = [];
  scene.fills.forEach((fill, index) => {
    const y = unitY(index);
    const led = fill > 0.92 ? "#ffffff" : LED;
    const width = (unit.w - 46) * fill;
    if (width > 1.5) {
      bars.push(
        `<rect x="${unit.x + 30}" y="${(y + 9).toFixed(1)}" width="${width.toFixed(2)}" height="${unit.h - 18}" rx="4" fill="${ACCENT}"></rect>`,
      );
    }
    faces.push(
      `<rect x="${unit.x}" y="${y.toFixed(1)}" width="${unit.w}" height="${unit.h}" rx="9" fill="none" stroke="${ink}" stroke-width="${stroke.toFixed(2)}"></rect>`,
    );
    faces.push(
      `<circle cx="${unit.x + 18}" cy="${(y + unit.h / 2).toFixed(1)}" r="3.2" fill="${led}"></circle>`,
    );
  });
  const tokens = scene.pieces
    .map((piece) => {
      if (piece.opacity < 0.22 || piece.x == null || piece.y == null || piece.stretch == null) {
        return "";
      }
      const width = TOKEN * (1 + piece.stretch * 0.95);
      const height = TOKEN * (1 - piece.stretch * 0.28);
      const x = piece.x - (width - TOKEN) * 0.35;
      const y = piece.y + (TOKEN - height) / 2;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="${(height / 2).toFixed(1)}" fill="${ACCENT}" opacity="${piece.opacity.toFixed(3)}"></rect>`;
    })
    .join("");
  return [
    `<rect x="${unit.x - 12}" y="${(stackTop - 12).toFixed(1)}" width="${unit.w + 24}" height="${stackH + 24}" rx="28" fill="${ACCENT}" opacity="${(scene.glow * 0.32).toFixed(3)}" filter="url(#${filterId})"></rect>`,
    bars.join(""),
    `<g transform="translate(${icon.x} ${icon.y}) scale(${icon.s})" fill="none" stroke="${STROKE}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path></g>`,
    `<circle cx="${clasp.x.toFixed(1)}" cy="${clasp.y.toFixed(1)}" r="4.5" fill="${ACCENT}" opacity="${scene.clasp.toFixed(3)}"></circle>`,
    tokens,
    faces.join(""),
  ].join("");
}

export function Assembly({
  mode,
  frame = "app",
}: {
  mode: AssemblyMode;
  frame?: "app" | "hero";
}) {
  const filterId = useId().replace(/:/g, "");
  const layerRef = useRef<SVGGElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId = 0;
    let started = performance.now();
    const draw = (now: number) => {
      const scene = sceneAt(modeRef.current, now - started, reduce.matches);
      layer.innerHTML = markup(scene, filterId);
      const live = !reduce.matches && modeRef.current !== "done";
      frameId = live ? requestAnimationFrame(draw) : 0;
    };
    const restart = () => {
      started = performance.now();
      if (!frameId) frameId = requestAnimationFrame(draw);
    };
    restart();
    reduce.addEventListener("change", restart);
    return () => {
      reduce.removeEventListener("change", restart);
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [filterId]);

  useEffect(() => {
    if (mode === "submit" || mode === "network" || mode === "wallet" || mode === "demo") {
      const layer = layerRef.current;
      if (layer) layer.dataset.mode = mode;
    }
  }, [mode]);

  const frameClass =
    frame === "hero"
      ? "aspect-[5/4] bg-transparent"
      : "aspect-[2/1] overflow-hidden rounded-xl bg-primary-deep";

  return (
    <div className={`relative ${frameClass}`} aria-hidden="true">
      <svg className="block h-full w-full" viewBox="0 0 640 512" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
        </defs>
        <g ref={layerRef} />
      </svg>
    </div>
  );
}
