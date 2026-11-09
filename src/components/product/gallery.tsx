"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { product } from "@/config/products";
import { cn } from "@/lib/utils";
import { SelectedPackBadge } from "./pack-picker";

/**
 * Product photos: a swipeable strip on mobile (scroll-snap, no JS needed to
 * swipe) with thumbnails and arrows that drive it.
 */
export function ProductGallery() {
  const images = product.images;
  const [active, setActive] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);

  function show(index: number) {
    const i = (index + images.length) % images.length;
    setActive(i);
    const strip = stripRef.current;
    strip?.scrollTo({ left: i * strip.clientWidth, behavior: "smooth" });
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-[2rem] bg-surface">
        <div
          ref={stripRef}
          className="flex snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto [&::-webkit-scrollbar]:hidden"
          onScroll={(e) => {
            const el = e.currentTarget;
            const i = Math.round(el.scrollLeft / el.clientWidth);
            if (i !== active) setActive(i);
          }}
          role="region"
          aria-roledescription="carousel"
          aria-label="Product photos"
          tabIndex={0}
        >
          {images.map((img, i) => (
            <div key={img.src} className="w-full shrink-0 snap-center" aria-hidden={i !== active}>
              <Image
                src={img.src}
                alt={img.alt}
                width={img.width}
                height={img.height}
                // First photo is the LCP image; the rest load right away at low priority so swiping never shows a blank frame.
                loading="eager"
                fetchPriority={i === 0 ? "high" : "low"}
                sizes="(min-width: 1024px) 560px, 100vw"
                className="aspect-square w-full object-cover"
              />
            </div>
          ))}
        </div>
        <SelectedPackBadge />
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => show(active - 1)}
              aria-label="Previous photo"
              className="absolute top-1/2 left-3 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-card hover:bg-white sm:grid"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => show(active + 1)}
              aria-label="Next photo"
              className="absolute top-1/2 right-3 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-card hover:bg-white sm:grid"
            >
              <ChevronRight className="size-5" />
            </button>
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5 sm:hidden" aria-hidden="true">
              {images.map((img, i) => (
                <span
                  key={img.src}
                  className={cn("h-1.5 rounded-full transition-all", i === active ? "w-5 bg-ink" : "w-1.5 bg-ink/30")}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <p className="mt-3 hidden text-sm text-muted sm:block" aria-live="polite">
        <span className="font-semibold text-ink">
          {active + 1} / {images.length}
        </span>{" "}
        · {images[active]?.alt}
      </p>
      {images.length > 1 && (
        // Phones swipe and see the dots; hiding the thumbnails there lifts the price onto the first screen.
        <div className="mt-3 hidden gap-2 overflow-x-auto pb-1 sm:flex">
          {images.map((img, i) => (
            <button
              key={img.src}
              type="button"
              onClick={() => show(i)}
              aria-label={`Show photo ${i + 1}: ${img.alt}`}
              aria-current={i === active}
              className={cn(
                "shrink-0 overflow-hidden rounded-xl border-2 transition-colors",
                i === active ? "border-brand" : "border-transparent opacity-80 hover:opacity-100",
              )}
            >
              <Image
                src={img.src}
                alt=""
                width={72}
                height={72}
                sizes="72px"
                className="size-14 object-cover sm:size-18"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
