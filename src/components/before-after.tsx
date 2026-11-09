"use client";

import Image from "next/image";
import { useRef, useState, type PointerEvent } from "react";
import { ChevronsLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Photo = { src: string; alt: string; width: number; height: number };

/**
 * Drag-to-compare slider: the "before" photo sits on top, clipped to the left
 * of the handle. Pointer drag works for mouse and touch (vertical page scroll
 * still works on phones); a range input gives keyboard and screen-reader
 * control and drives the same position.
 */
export function BeforeAfter({ before, after, className }: { before: Photo; after: Photo; className?: string }) {
  const [pos, setPos] = useState(50);
  const [dragging, setDragging] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  function moveTo(clientX: number) {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const pct = ((clientX - box.left) / box.width) * 100;
    setPos(Math.min(100, Math.max(0, pct)));
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    moveTo(e.clientX);
  }

  return (
    <div
      ref={boxRef}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => dragging && moveTo(e.clientX)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      className={cn(
        "relative aspect-[3/2] cursor-ew-resize touch-pan-y overflow-hidden rounded-[2rem] shadow-card select-none",
        className,
      )}
    >
      <Image
        src={after.src}
        alt={after.alt}
        width={after.width}
        height={after.height}
        sizes="(min-width: 768px) 50vw, 100vw"
        draggable={false}
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <Image
          src={before.src}
          alt={before.alt}
          width={before.width}
          height={before.height}
          sizes="(min-width: 768px) 50vw, 100vw"
          draggable={false}
          className="size-full object-cover"
        />
      </div>

      <span className="pointer-events-none absolute top-4 left-4 rounded-full bg-ink/85 px-3 py-1 text-sm font-bold text-white">
        Before
      </span>
      <span className="pointer-events-none absolute top-4 right-4 rounded-full bg-success px-3 py-1 text-sm font-bold text-white">
        After
      </span>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(pos)}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Compare before and after cleaning"
        aria-valuetext={`${Math.round(pos)}% before, ${100 - Math.round(pos)}% after`}
        className="peer sr-only"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 -translate-x-1/2"
        style={{ left: `${pos}%` }}
      >
        <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-white shadow-[0_0_8px_rgb(0_0_0/0.35)]" />
        <div
          className={cn(
            "absolute top-1/2 left-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-ink shadow-lg transition-transform",
            dragging && "scale-110",
          )}
        >
          <ChevronsLeftRight className="size-6" />
        </div>
      </div>
      {/* Visible focus ring when the slider is focused with the keyboard. */}
      <div className="pointer-events-none absolute inset-0 rounded-[2rem] ring-brand peer-focus-visible:ring-4" />
    </div>
  );
}
