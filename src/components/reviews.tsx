"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  BadgeCheck,
  Camera,
  ChevronLeft,
  ChevronRight,
  MessageSquarePlus,
  Star,
  StarHalf,
  TriangleAlert,
  X,
} from "lucide-react";
// Genuine reviews, plus the samples while SHOW_SAMPLE_REVIEWS is on; samples always sit under their notice.
import { displayedReviews as allReviews, reviewStats as statsFor, type Review } from "@/config/reviews";

const reviewStats = () => statsFor(allReviews);
import { whatsappLink } from "@/config/site";
import { cn, formatDate } from "@/lib/utils";
import { buttonClasses } from "./ui/button";

export function Stars({ rating, className }: { rating: number; className?: string }) {
  const rounded = Math.round(rating * 2) / 2;
  return (
    <span
      className={cn("inline-flex text-[#f5a524]", className)}
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
      role="img"
    >
      {[1, 2, 3, 4, 5].map((i) =>
        rounded >= i ? (
          <Star key={i} className="size-[1em] fill-current" aria-hidden="true" />
        ) : rounded >= i - 0.5 ? (
          <span key={i} className="relative inline-flex" aria-hidden="true">
            <Star className="size-[1em] text-line" />
            <StarHalf className="absolute inset-0 size-[1em] fill-current" />
          </span>
        ) : (
          <Star key={i} className="size-[1em] text-line" aria-hidden="true" />
        ),
      )}
    </span>
  );
}

/** Shown above any reviews that are placeholders. Keep it until real reviews replace them. */
export function SampleNotice() {
  return (
    <></>
  );
}

/** Compact rating line for the product header; links to the reviews section. */
export function RatingInline({ href = "#reviews" }: { href?: string }) {
  const stats = reviewStats();
  if (!stats.count) return null;
  return (
    <a href={href} className="inline-flex items-center gap-2 text-sm hover:underline">
      <Stars rating={stats.average} className="text-base" />
      <span className="font-semibold">{stats.average.toFixed(1)}</span>
      <span className="text-muted">
        · {stats.count} {stats.hasSamples ? "sample " : ""}review{stats.count === 1 ? "" : "s"}
      </span>
    </a>
  );
}

function Lightbox({
  photos,
  index,
  onClose,
  onMove,
}: {
  photos: Review[];
  index: number;
  onClose: () => void;
  onMove: (i: number) => void;
}) {
  const r = photos[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onMove((index + 1) % photos.length);
      if (e.key === "ArrowLeft") onMove((index - 1 + photos.length) % photos.length);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, photos.length, onClose, onMove]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Customer photo"
      className="animate-fade-in fixed inset-0 z-[70] flex flex-col bg-ink/90 p-4"
    >
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close photo"
          className="grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          autoFocus
        >
          <X className="size-6" />
        </button>
      </div>
      <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center">
        <Image
          src={r.photo!}
          alt={r.photoAlt ?? `Photo from ${r.name}`}
          width={1024}
          height={1024}
          sizes="(min-width: 768px) 672px, 100vw"
          className="max-h-[70vh] w-full rounded-2xl object-contain"
        />
        <div className="mt-4 text-white">
          <Stars rating={r.rating} />
          <p className="mt-1 font-bold">{r.title}</p>
          <p className="text-sm text-white/70">
            {r.name} · {r.city}
          </p>
        </div>
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => onMove((index - 1 + photos.length) % photos.length)}
              aria-label="Previous photo"
              className="absolute top-1/2 -left-1 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink sm:-left-14"
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              type="button"
              onClick={() => onMove((index + 1) % photos.length)}
              aria-label="Next photo"
              className="absolute top-1/2 -right-1 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink sm:-right-14"
            >
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function ReviewCard({ review, onPhoto }: { review: Review; onPhoto?: () => void }) {
  return (
    <li className="mb-4 break-inside-avoid rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <Stars rating={review.rating} />
        <span className="text-xs text-muted">{formatDate(review.date)}</span>
      </div>
      <p className="mt-3 font-bold">{review.title}</p>
      <p className="mt-1 text-ink-soft">{review.text}</p>
      {review.photo && (
        <button
          type="button"
          onClick={onPhoto}
          className="mt-4 block overflow-hidden rounded-2xl"
          aria-label={`Open photo from ${review.name}`}
        >
          <Image
            src={review.photo}
            alt={review.photoAlt ?? `Photo from ${review.name}`}
            width={512}
            height={512}
            sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 90vw"
            className="aspect-[4/3] w-full object-cover transition-transform hover:scale-[1.03]"
          />
        </button>
      )}
      <div className="mt-4 flex items-center gap-3 text-sm">
        <span
          className="grid size-9 place-items-center rounded-full bg-brand-soft font-bold text-brand"
          aria-hidden="true"
        >
          {review.name.charAt(0)}
        </span>
        <div>
          <p className="font-semibold">
            {review.name} <span className="font-normal text-muted">· {review.city}</span>
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {review.sample ? (
              <span className="font-bold text-warn">Sample review</span>
            ) : (
              review.orderNumber && (
                <span className="inline-flex items-center gap-1 font-bold text-success">
                  <BadgeCheck className="size-3.5" aria-hidden="true" /> Verified buyer
                </span>
              )
            )}
            {review.pack && <span>Bought: {review.pack}</span>}
          </p>
        </div>
      </div>
    </li>
  );
}

/**
 * One short review for the buy box, so proof sits next to the Buy button.
 * Picks the newest 5-star review; sample reviews say so.
 */
export function ReviewHighlight() {
  const review = allReviews.find((r) => r.rating === 5);
  if (!review) return null;
  return (
    <figure className="rounded-2xl bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <Stars rating={review.rating} className="text-sm" />
        {review.sample && <span className="text-xs font-bold text-warn">Sample review</span>}
      </div>
      <blockquote className="mt-2 line-clamp-3 text-sm text-ink-soft">
        <span className="font-bold text-ink">{review.title}</span> {review.text}
      </blockquote>
      <figcaption className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
        <span>
          {review.name} · {review.city}
        </span>
        <a href="#review-list" className="font-bold text-brand hover:underline">
          Read all reviews
        </a>
      </figcaption>
    </figure>
  );
}

type Filter = "all" | "photos" | 1 | 2 | 3 | 4 | 5;
type Sort = "recent" | "high" | "low";

function applyFilter(list: Review[], filter: Filter, sort: Sort): Review[] {
  const kept = list.filter((r) =>
    filter === "all" ? true : filter === "photos" ? Boolean(r.photo) : r.rating === filter,
  );
  const byDate = (a: Review, b: Review) => b.date.localeCompare(a.date);
  return [...kept].sort((a, b) =>
    sort === "high"
      ? b.rating - a.rating || byDate(a, b)
      : sort === "low"
        ? a.rating - b.rating || byDate(a, b)
        : byDate(a, b),
  );
}

/** Invites buyers to send a review, so genuine ones can replace the samples. */
function ShareReview() {
  const href = whatsappLink("Hello Tidy team, here's my review of the sponges:") ?? "/contact";
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="inline-flex items-center gap-2 text-sm font-bold text-brand hover:underline"
    >
      <MessageSquarePlus className="size-4" aria-hidden="true" /> Bought Hello Tidy? Share your review
    </a>
  );
}

/**
 * Reviews with a rating summary, customer photo strip and a lightbox.
 * - `limit` + `moreHref`: show the first few with a link to the full list (home page).
 * - `initialCount`: the full product-page version, with rating filters, sorting
 *   and a "Show all" button after the first few.
 */
export function ReviewsSection({
  limit,
  moreHref,
  initialCount,
}: {
  limit?: number;
  moreHref?: string;
  initialCount?: number;
}) {
  const stats = reviewStats();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  if (!stats.count) return null;

  const interactive = initialCount !== undefined;
  const matching = interactive ? applyFilter(allReviews, filter, sort) : allReviews;
  const visible = limit ?? (initialCount && !expanded ? initialCount : matching.length);
  const list = matching.slice(0, visible);
  const photos = allReviews.filter((r) => r.photo);
  const openPhoto = (r: Review) => setLightbox(photos.indexOf(r));
  const positive = allReviews.filter((r) => r.rating >= 4).length;
  // Clicking the active filter again goes back to all reviews.
  const choose = (next: Filter) => {
    setFilter((current) => (current === next && next !== "all" ? "all" : next));
    setExpanded(false);
  };

  const chips: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "All", count: stats.count },
    ...(photos.length ? [{ value: "photos" as const, label: "With photos", count: photos.length }] : []),
    ...stats.distribution
      .filter((d) => d.count > 0)
      .map((d) => ({ value: d.stars, label: `${d.stars}★`, count: d.count })),
  ];

  return (
    <div>
      {stats.hasSamples && <SampleNotice />}

      <div
        id="reviews-summary"
        className="mb-8 grid gap-6 rounded-3xl bg-white p-5 shadow-card sm:p-8 lg:grid-cols-[260px_1fr] lg:items-center"
      >
        <div className="text-center lg:text-left">
          <p className="text-5xl font-extrabold tracking-tight">{stats.average.toFixed(1)}</p>
          <Stars rating={stats.average} className="mt-1 text-xl" />
          <p className="mt-1 text-sm text-muted">
            Based on {stats.count} {stats.hasSamples ? "sample " : ""}review{stats.count === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-sm font-semibold text-success">
            {Math.round((positive / stats.count) * 100)}% rated it 4 or 5 stars
          </p>
          <ul className="mx-auto mt-4 max-w-xs space-y-1.5 lg:mx-0">
            {stats.distribution.map((d) => (
              <li key={d.stars} className="flex items-center gap-2 text-xs">
                <span className="w-6 text-right font-semibold">{d.stars}★</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                  <span
                    className="block h-full rounded-full bg-[#f5a524]"
                    style={{ width: `${(d.count / stats.count) * 100}%` }}
                  />
                </span>
                <span className="w-4 text-muted">{d.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          {photos.length > 0 && (
            <>
              <p className="mb-3 text-sm font-bold">Customer photos</p>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {photos.map((r) => (
                  <li key={r.photo}>
                    <button
                      type="button"
                      onClick={() => openPhoto(r)}
                      className="block w-full overflow-hidden rounded-xl"
                      aria-label={`Open photo from ${r.name}`}
                    >
                      <Image
                        src={r.photo!}
                        alt={r.photoAlt ?? `Photo from ${r.name}`}
                        width={200}
                        height={200}
                        sizes="(min-width: 640px) 120px, 30vw"
                        className="aspect-square w-full object-cover transition-transform hover:scale-105"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {interactive && (
            <div className={cn("text-center lg:text-left", photos.length > 0 && "mt-4")}>
              <ShareReview />
            </div>
          )}
        </div>
      </div>

      {interactive && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Filter reviews" className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={String(c.value)}
                type="button"
                aria-pressed={filter === c.value}
                onClick={() => choose(c.value)}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors",
                  filter === c.value ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink/40",
                )}
              >
                {c.value === "photos" && <Camera className="size-4" aria-hidden="true" />}
                {c.label} <span className={filter === c.value ? "text-white/75" : "text-muted"}>({c.count})</span>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="font-semibold">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="select-chevron h-10 appearance-none rounded-full border border-line bg-white pr-10 pl-4 font-semibold"
            >
              <option value="recent">Most recent</option>
              <option value="high">Highest rated</option>
              <option value="low">Lowest rated</option>
            </select>
          </label>
        </div>
      )}

      {interactive && (
        <p className="sr-only" aria-live="polite">
          Showing {list.length} of {matching.length} reviews
        </p>
      )}
      <ul id="review-list" className="scroll-mt-28 columns-1 gap-4 sm:columns-2 lg:columns-3">
        {list.map((r) => (
          <ReviewCard key={`${r.name}-${r.date}`} review={r} onPhoto={r.photo ? () => openPhoto(r) : undefined} />
        ))}
      </ul>

      {initialCount && !expanded && matching.length > initialCount && (
        <p className="mt-2 text-center">
          <button type="button" onClick={() => setExpanded(true)} className={buttonClasses("outline", "md")}>
            Show all {matching.length} {filter === "all" ? "" : "matching "}reviews
          </button>
        </p>
      )}

      {limit && moreHref && allReviews.length > limit && (
        <p className="mt-2 text-center">
          <Link href={moreHref} className="font-semibold text-brand hover:underline">
            Read all {stats.count} reviews →
          </Link>
        </p>
      )}

      {lightbox !== null && photos[lightbox] && (
        <Lightbox photos={photos} index={lightbox} onClose={() => setLightbox(null)} onMove={setLightbox} />
      )}
    </div>
  );
}
