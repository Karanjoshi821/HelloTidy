"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Flame,
  House,
  MessageSquareText,
  Play,
  RotateCcw,
  Sparkles,
  Star,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react";
import { displayedVideoReviews, type VideoReview } from "@/config/video-reviews";
import { genuineReviews } from "@/config/reviews";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";
import { trackVideoPlay } from "@/lib/analytics/track";

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const initial = (name?: string) => name?.trim().charAt(0).toUpperCase() || "H";

/** The customer's name as they agreed to show it, or a neutral stand-in. */
const nameOf = (v: VideoReview) => v.name ?? "Hello Tidy customer";

/** Second line under the name. "Verified buyer" only when the clip is tied to an order. */
function subtitleOf(v: VideoReview): string {
  if (v.placeholder) return "Placeholder clip";
  if (!v.consent) return "Not published yet";
  return [v.orderNumber && "Verified buyer", v.city].filter(Boolean).join(" · ") || "Shared with permission";
}

// ───────────── Trust row ─────────────

type TrustItem = { icon: LucideIcon; title: string; text: string };

const TRUST: TrustItem[] = [
  { icon: Droplets, title: "Just add water", text: "No harsh chemicals" },
  { icon: Truck, title: "Free delivery", text: "Across India" },
  {
    icon: RotateCcw,
    title: `${siteConfig.shipping.claimWindowDays}-day replacement`,
    text: "If it arrives damaged",
  },
];
const COD: TrustItem = { icon: Banknote, title: "Cash on Delivery", text: "Pay when it arrives" };

/** Rating from genuine reviews only; sample reviews never count towards it. */
function genuineRating() {
  if (!genuineReviews.length) return null;
  const average = genuineReviews.reduce((s, r) => s + r.rating, 0) / genuineReviews.length;
  return { average, count: genuineReviews.length, names: genuineReviews.slice(0, 3).map((r) => r.name) };
}

function TrustRow() {
  const rating = genuineRating();
  const items = rating ? TRUST : [COD, ...TRUST];
  const cell = "flex items-center gap-2.5 text-left sm:gap-3 lg:px-5 xl:px-7";
  const divider = "lg:border-l lg:border-white/20";

  return (
    <ul className="mx-auto mt-8 grid max-w-5xl grid-cols-2 gap-x-4 gap-y-5 sm:mt-10 sm:gap-x-8 lg:flex lg:items-center lg:justify-center lg:gap-0">
      {rating && (
        <li className={cell}>
          <span className="flex shrink-0 -space-x-2.5" aria-hidden="true">
            {rating.names.map((name, i) => (
              <span
                key={i}
                className="grid size-9 place-items-center rounded-full bg-mint text-sm font-bold text-ink ring-2 ring-forest sm:size-10"
              >
                {initial(name)}
              </span>
            ))}
          </span>
          <span>
            <span className="flex items-center gap-1 leading-tight font-bold">
              {rating.average.toFixed(1)}/5
              <Star className="size-4 fill-[#f5a524] text-[#f5a524]" aria-hidden="true" />
            </span>
            <span className="block text-sm text-white/70">
              from {rating.count} customer review{rating.count === 1 ? "" : "s"}
            </span>
          </span>
        </li>
      )}
      {items.map(({ icon: Icon, title, text }, i) => (
        <li key={title} className={cn(cell, (rating || i > 0) && divider)}>
          <Icon className="size-6 shrink-0 text-white sm:size-8" strokeWidth={1.6} aria-hidden="true" />
          <span>
            <span className="block leading-tight font-bold">{title}</span>
            <span className="block text-sm text-white/70">{text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ───────────── Cards ─────────────

function CardBadge({ review, featured }: { review: VideoReview; featured: boolean }) {
  const base =
    "absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold shadow-sm";
  if (review.placeholder) return <span className={cn(base, "bg-warn-soft text-ink")}>Placeholder</span>;
  if (featured)
    return (
      <span className={cn(base, "bg-lime text-ink")}>
        <Flame className="size-3.5 fill-current" aria-hidden="true" /> Featured
      </span>
    );
  const home = review.label === "home";
  const Icon = home ? House : MessageSquareText;
  return (
    <span className={cn(base, "bg-white/95 text-ink")}>
      <Icon className="size-3.5" aria-hidden="true" /> {home ? "Real home" : "Customer review"}
    </span>
  );
}

const IMAGE_SIZES = "(min-width: 1280px) 285px, (min-width: 1024px) 32vw, (min-width: 640px) 48vw, 80vw";

function Half({ src, label, after }: { src: string; label: string; after?: boolean }) {
  return (
    <span className={cn("absolute inset-x-0 h-1/2 overflow-hidden", after ? "bottom-0" : "top-0")}>
      <Image
        src={src}
        alt=""
        fill
        sizes={IMAGE_SIZES}
        className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
      />
      <span
        className={cn(
          "absolute bottom-3 left-3 rounded-md px-2 py-0.5 text-xs font-bold text-white",
          after ? "bg-brand-dark" : "bg-black/55 backdrop-blur-sm",
        )}
      >
        {label}
      </span>
    </span>
  );
}

function VideoCard({
  review,
  featured,
  onOpen,
}: {
  review: VideoReview;
  featured: boolean;
  onOpen: (el: HTMLButtonElement) => void;
}) {
  const verified = Boolean(review.orderNumber) && !review.placeholder;
  const name = nameOf(review);

  return (
    <li className="w-[80%] shrink-0 snap-start sm:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-2.5rem)/3)] xl:w-[calc((100%-3.75rem)/4)]">
      {/* The quote is the button; its ::after stretches over the card, so a tap anywhere plays the clip. */}
      <div
        className={cn(
          "group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-[22px] bg-white text-left text-ink",
          "shadow-[0_12px_32px_-14px_rgb(0_0_0/0.55)] transition duration-300 hover:-translate-y-1",
          "has-[button:focus-visible]:outline-3 has-[button:focus-visible]:outline-offset-4 has-[button:focus-visible]:outline-lime",
          featured && "shadow-[0_0_0_7px_rgb(205_242_107/0.14),0_18px_40px_-14px_rgb(0_0_0/0.6)] ring-[3px] ring-lime",
        )}
      >
        <span className="relative block aspect-[25/24] w-full overflow-hidden bg-ink">
          {review.before && review.after ? (
            <>
              <Half src={review.before} label="Before" />
              <Half src={review.after} label="After" after />
              <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-white" />
            </>
          ) : (
            <Image
              src={review.poster}
              alt=""
              fill
              sizes={IMAGE_SIZES}
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          )}
          <CardBadge review={review} featured={featured} />
          <span className="absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white tabular-nums">
            {formatDuration(review.duration)}
          </span>
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid size-14 place-items-center rounded-full bg-white text-ink shadow-lg transition-transform duration-300 group-hover:scale-110">
              <Play className="ml-0.5 size-6 fill-current" aria-hidden="true" />
            </span>
          </span>
        </span>

        <span className="flex flex-1 flex-col p-4 sm:p-5">
          <button
            type="button"
            onClick={(e) => onOpen(e.currentTarget)}
            className="cursor-pointer text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            <span className="line-clamp-2 min-h-[2.75em] text-[17px] leading-snug font-bold">
              <span className="sr-only">Play video: </span>&ldquo;{review.title}&rdquo;
              <span className="sr-only">
                , {formatDuration(review.duration)}, from {name}
              </span>
            </span>
          </button>
          <span className="mt-3 flex items-center gap-3">
            {review.avatar ? (
              <Image
                src={review.avatar}
                alt=""
                width={44}
                height={44}
                className="size-11 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-brand-dark">
                {initial(review.name)}
              </span>
            )}
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-semibold">
                <span className="truncate">{name}</span>
                {verified && <BadgeCheck className="size-[18px] shrink-0 fill-brand text-white" aria-hidden="true" />}
              </span>
              <span className="block truncate text-sm text-muted">{subtitleOf(review)}</span>
            </span>
          </span>
        </span>
      </div>
    </li>
  );
}

// ───────────── Carousel ─────────────

/** Scroll state of a snap carousel: whether it overflows, which way it can move, and the current position. */
function useCarousel(count: number) {
  const ref = useRef<HTMLUListElement>(null);
  const [state, setState] = useState({ overflow: false, prev: false, next: false, index: 0, positions: 1 });

  const step = useCallback(() => {
    const el = ref.current;
    const first = el?.children[0] as HTMLElement | undefined;
    if (!el || !first) return 1;
    return first.offsetWidth + (parseFloat(getComputedStyle(el).columnGap) || 0);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const size = step();
        const max = el.scrollWidth - el.clientWidth;
        const perView = Math.max(1, Math.round((el.clientWidth + 1) / size));
        const positions = Math.max(1, count - perView + 1);
        const index = max - el.scrollLeft < 4 ? positions - 1 : Math.round(el.scrollLeft / size);
        setState({
          overflow: max > 4,
          prev: el.scrollLeft > 4,
          next: el.scrollLeft < max - 4,
          index: Math.min(positions - 1, Math.max(0, index)),
          positions,
        });
      });
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", measure);
      resize.disconnect();
    };
  }, [count, step]);

  const go = (index: number) => ref.current?.scrollTo({ left: index * step(), behavior: "smooth" });
  return { ref, state, go };
}

function Arrow({ side, disabled, onClick }: { side: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  const Icon = side === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "prev" ? "Previous videos" : "Next videos"}
      className={cn(
        "absolute top-[calc(50%-1rem)] z-10 hidden size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-white/40 bg-forest/80 text-white backdrop-blur-sm transition hover:bg-forest-soft disabled:cursor-default disabled:opacity-30 sm:grid",
        side === "prev" ? "-left-3 xl:-left-16" : "-right-3 xl:-right-16",
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}

// ───────────── Player ─────────────

function Player({ review, onClose }: { review: VideoReview; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Start with sound: the shopper just tapped play. If the browser still blocks sound, start muted;
    // the controls can turn it on.
    const v = video.current;
    v?.play().catch(() => {
      if (!v) return;
      v.muted = true;
      v.play().catch(() => {});
    });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const sub = subtitleOf(review);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Customer video: ${review.title}`}
      className="animate-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-w-full flex-col">
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close video"
            autoFocus
            className="grid size-11 cursor-pointer place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="size-6" aria-hidden="true" />
          </button>
        </div>
        <video
          ref={video}
          src={review.src}
          poster={review.poster}
          controls
          playsInline
          preload="auto"
          className="aspect-[9/16] h-[72vh] max-h-[calc((100vw-2rem)*16/9)] w-auto max-w-full rounded-2xl bg-black"
        >
          {review.captions && <track kind="captions" src={review.captions} srcLang="en" label="English" default />}
          Your browser can&apos;t play this video.
        </video>
        <div className="mt-3 text-white">
          <p className="font-bold">{review.title}</p>
          <p className="text-sm text-white/70">
            {nameOf(review)}
            {sub && ` · ${sub}`}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ───────────── Section ─────────────

function Decor() {
  return (
    <>
      <svg
        className="pointer-events-none absolute -top-6 right-0 w-[48%] max-w-[700px] text-white/[0.045]"
        viewBox="0 0 600 300"
        aria-hidden="true"
      >
        <path d="M600 0H170c70 40 110 150 270 175 70 11 120 55 160 125V0Z" fill="currentColor" />
      </svg>
      <svg
        className="pointer-events-none absolute bottom-0 left-0 w-[42%] max-w-[620px] text-white/[0.05]"
        viewBox="0 0 600 260"
        aria-hidden="true"
      >
        <path d="M0 260V70c90-55 200-45 265 25 60 65 150 115 250 165H0Z" fill="currentColor" />
      </svg>
    </>
  );
}

function Swoosh({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 140 12" fill="none" aria-hidden="true">
      <path d="M3 9.5C38 4 86 2.5 137 5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Customer video reviews in a deep green band: trust facts, before/after cards
 * (tap anywhere on a card to watch with sound and captions), and a shop banner.
 * Renders nothing until there is a clip to show. Every fact here is true for
 * the store: the rating appears only once genuine reviews exist.
 */
export function VideoReviewsSection({ shopHref, reviewsHref }: { shopHref: string; reviewsHref?: string }) {
  const [playing, setPlaying] = useState<VideoReview | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const { ref: listRef, state: scroll, go } = useCarousel(displayedVideoReviews.length);
  const close = useCallback(() => {
    setPlaying(null);
    opener.current?.focus();
  }, []);
  if (!displayedVideoReviews.length) return null;

  return (
    <section
      id="video-reviews"
      aria-labelledby="video-reviews-title"
      className="relative isolate scroll-mt-16 overflow-hidden bg-forest bg-[radial-gradient(ellipse_at_50%_0%,#145a3a_0%,transparent_60%)] py-14 text-white sm:py-20"
    >
      <Decor />
      <div className="relative mx-auto w-full max-w-[1200px] px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-lime/35 bg-white/[0.06] px-4 py-1.5 text-sm font-semibold">
            <Play className="size-3.5 fill-lime text-lime" aria-hidden="true" />
            Real homes, real results
          </p>
          <h2
            id="video-reviews-title"
            className="mt-5 text-[2rem] leading-tight font-extrabold tracking-tight text-balance sm:text-5xl"
          >
            Watch{" "}
            <span className="relative inline-block whitespace-nowrap text-lime">
              Hello Tidy
              <Swoosh className="absolute -bottom-1.5 left-[42%] w-[60%] text-lime sm:-bottom-2.5" />
            </span>{" "}
            in real homes
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base text-pretty text-white/80 sm:text-lg">
            See how our customers use Hello Tidy to make cleaning easier, faster and more satisfying, with real before
            and after results.
          </p>
        </div>

        <TrustRow />

        <div className="relative mt-8 sm:mt-10">
          <ul
            ref={listRef}
            aria-label="Customer videos"
            className="-mx-4 flex snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] gap-5 overflow-x-auto px-4 pt-3 pb-6 sm:-mx-3 sm:scroll-px-3 sm:px-3 [&::-webkit-scrollbar]:hidden [&>li:first-child]:ml-auto [&>li:last-child]:mr-auto"
          >
            {displayedVideoReviews.map((review, i) => (
              <VideoCard
                key={review.id}
                review={review}
                featured={i === 0}
                onOpen={(el) => {
                  opener.current = el;
                  setPlaying(review);
                  trackVideoPlay(review.id);
                }}
              />
            ))}
          </ul>
          {scroll.overflow && (
            <>
              <Arrow side="prev" disabled={!scroll.prev} onClick={() => go(scroll.index - 1)} />
              <Arrow side="next" disabled={!scroll.next} onClick={() => go(scroll.index + 1)} />
            </>
          )}
        </div>

        {scroll.overflow && scroll.positions > 1 && (
          <div className="mt-1 flex justify-center gap-1">
            {Array.from({ length: scroll.positions }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show video ${i + 1}`}
                aria-current={scroll.index === i ? "true" : undefined}
                className="cursor-pointer p-1.5"
              >
                <span
                  className={cn(
                    "block size-2.5 rounded-full transition-colors",
                    scroll.index === i ? "bg-lime" : "bg-white/30",
                  )}
                />
              </button>
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-5 rounded-3xl border border-white/15 bg-white/[0.06] p-6 text-center backdrop-blur-sm sm:mt-10 lg:flex-row lg:px-12 lg:text-left">
          <Sparkles className="size-9 shrink-0 text-lime" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-xl font-extrabold sm:text-2xl">Ready to see the difference at home?</p>
            <p className="mt-1 text-white/75">Free delivery across India, and Cash on Delivery if you prefer.</p>
          </div>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
            <Link
              href={shopHref}
              className="inline-flex items-center gap-2 rounded-xl bg-lime px-7 py-3.5 text-lg font-extrabold text-ink transition hover:brightness-105 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-lime"
            >
              Shop now <ArrowRight className="size-5" aria-hidden="true" />
            </Link>
            {reviewsHref && (
              <>
                <span className="hidden h-12 w-px bg-white/20 sm:block" aria-hidden="true" />
                <Link href={reviewsHref} className="inline-flex items-center gap-2 font-bold hover:underline">
                  <MessageSquareText className="size-5" aria-hidden="true" />
                  More reviews
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {playing && <Player review={playing} onClose={close} />}
    </section>
  );
}
