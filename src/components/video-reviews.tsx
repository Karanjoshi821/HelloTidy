"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Play, ShieldCheck, TriangleAlert } from "lucide-react";
import { displayedVideoReviews, type VideoReview } from "@/config/video-reviews";
import { cn } from "@/lib/utils";
import { Section } from "./ui/layout";

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function VideoCard({
  review,
  active,
  onPlay,
  onEnded,
}: {
  review: VideoReview;
  active: boolean;
  onPlay: () => void;
  onEnded: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  // Start with sound once the shopper presses play (a user gesture, so browsers allow it).
  useEffect(() => {
    if (active) ref.current?.play().catch(() => {});
  }, [active]);

  const who = [review.name, review.city].filter(Boolean).join(", ") || "Hello Tidy customer";

  return (
    <li className="w-[68%] shrink-0 snap-start sm:w-auto">
      <figure className="h-full overflow-hidden rounded-3xl border border-line bg-white shadow-sm">
        <div className="relative aspect-[9/16] bg-ink">
          {active ? (
            <video
              ref={ref}
              src={review.src}
              poster={review.poster}
              controls
              playsInline
              preload="auto"
              onEnded={onEnded}
              aria-label={`Customer video: ${review.title}`}
              className="absolute inset-0 size-full bg-black object-cover"
            >
              Your browser can&apos;t play this video.
            </video>
          ) : (
            <button
              type="button"
              onClick={onPlay}
              aria-label={`Play customer video: ${review.title} (${formatDuration(review.duration)})`}
              className="group absolute inset-0 cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <Image
                src={review.poster}
                alt=""
                fill
                sizes="(min-width: 1024px) 270px, (min-width: 640px) 45vw, 68vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
              <span
                className={cn(
                  "absolute top-3 left-3 rounded-full px-2.5 py-1 text-xs font-bold",
                  review.placeholder ? "bg-warn-soft text-ink" : "bg-white/90 text-ink",
                )}
              >
                {review.placeholder ? "Placeholder" : "Customer video"}
              </span>
              <span className="absolute top-3 right-3 rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-white tabular-nums">
                {formatDuration(review.duration)}
              </span>
              {/* Upper third, so the cover's before/after labels stay visible. */}
              <span className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <span className="grid size-16 place-items-center rounded-full bg-white/95 text-brand shadow-lg transition-transform group-hover:scale-110">
                  <Play className="ml-1 size-7 fill-current" aria-hidden="true" />
                </span>
              </span>
            </button>
          )}
        </div>
        <figcaption className="p-4">
          <p className="leading-snug font-bold text-ink">{review.title}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            {review.orderNumber && <BadgeCheck className="size-4 text-brand" aria-hidden="true" />}
            {who}
            {review.orderNumber && <span className="font-semibold text-brand">· Verified buyer</span>}
          </p>
        </figcaption>
      </figure>
    </li>
  );
}

/**
 * Customer video reviews in a dark band: tap a card to play it in place; one
 * plays at a time. Renders nothing until there is a clip to show.
 */
export function VideoReviewsSection({ title }: { title: string }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  if (!displayedVideoReviews.length) return null;
  const hasPlaceholders = displayedVideoReviews.some((v) => v.placeholder);

  return (
    <Section id="video-reviews" className="scroll-mt-16 bg-ink text-white">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <p className="mb-2 text-sm font-semibold tracking-wide text-mint uppercase">Video reviews</p>
        <h2 className="text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-4xl">{title}</h2>
        <p className="mt-3 text-lg text-pretty text-white/70">
          Short clips from customers, cleaning their own walls and shoes. Tap one to watch it with sound.
        </p>
      </div>
      {hasPlaceholders && (
      <></>
      )}
      <ul className="-mx-4 flex snap-x snap-mandatory scroll-pl-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
        {displayedVideoReviews.map((review) => (
          <VideoCard
            key={review.id}
            review={review}
            active={activeId === review.id}
            onPlay={() => setActiveId(review.id)}
            onEnded={() => setActiveId(null)}
          />
        ))}
      </ul>
      <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-white/70">
        <ShieldCheck className="size-4 shrink-0 text-mint" aria-hidden="true" />
        Shared by our customers, with their permission, as they sent them.
      </p>
    </Section>
  );
}
