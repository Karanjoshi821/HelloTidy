"use client";

import { useSyncExternalStore, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { Moon, Sun, type LucideIcon } from "lucide-react";
import { ADMIN_THEME_EVENT, ADMIN_THEME_KEY, type AdminTheme } from "@/lib/admin-theme";
import { createBlob } from "@/lib/theme-blob";
import { cn } from "@/lib/utils";

const DURATION_MS = 650;

function currentTheme(): AdminTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function setTheme(next: AdminTheme) {
  document.documentElement.classList.toggle("dark", next === "dark");
  try {
    localStorage.setItem(ADMIN_THEME_KEY, next);
  } catch {
    // Private mode or storage blocked: the theme still applies for this visit.
  }
  window.dispatchEvent(new Event(ADMIN_THEME_EVENT));
}

function subscribe(onChange: () => void) {
  // Another tab switched theme: follow it here too (no animation; nobody clicked here).
  const onStorage = (e: StorageEvent) => {
    if (e.key !== ADMIN_THEME_KEY) return;
    document.documentElement.classList.toggle("dark", e.newValue === "dark");
    onChange();
  };
  window.addEventListener(ADMIN_THEME_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(ADMIN_THEME_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** One switch at a time, across every toggle on the page (sidebar and phone menu). */
let switching = false;

/**
 * Switches to `next` with the ink-drop blob growing from (x, y): a View
 * Transition whose new snapshot is clipped to the blob.
 *
 * The blob is redrawn on every screen refresh through a style rule on the new
 * snapshot, not played as a clip-path animation: Chromium hands clip-path
 * animations to its compositor, which stalled once the blob was large (no new
 * frames for ~350 ms mid-switch, then a jump). Per-frame updates keep drawing,
 * and each frame shows the exact shape for that moment. The rule starts as a
 * dot, so the new theme never shows in full before the first frame.
 */
async function switchWithBlob(next: AdminTheme, x: number, y: number) {
  const root = document.documentElement;
  const blob = createBlob(x, y, window.innerWidth, window.innerHeight);
  const style = document.createElement("style");
  document.head.append(style);
  const sheet = style.sheet!;
  const rule = sheet.cssRules[sheet.insertRule("::view-transition-new(root) {}")] as CSSStyleRule;
  rule.style.clipPath = blob(0);

  switching = true;
  // Stops hover/colour transitions from easing inside the blob: the new theme appears as-is.
  root.setAttribute("data-theme-switching", "");
  let frame = 0;
  try {
    const transition = document.startViewTransition(() => flushSync(() => setTheme(next)));
    await transition.ready;
    // Does nothing visible; it keeps the transition open while the blob grows.
    root.animate({ opacity: [1, 1] }, { duration: DURATION_MS, pseudoElement: "::view-transition-new(root)" });
    let start = -1;
    const draw = (now: number) => {
      if (start < 0) start = now;
      const t = (now - start) / DURATION_MS;
      rule.style.clipPath = blob(t);
      if (t < 1) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    await transition.finished;
  } catch {
    // The browser skipped the animation (e.g. tab hidden); the theme has still switched.
    if (currentTheme() !== next) setTheme(next);
  } finally {
    cancelAnimationFrame(frame);
    style.remove();
    root.removeAttribute("data-theme-switching");
    switching = false;
  }
}

const OPTIONS: { value: AdminTheme; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light theme", icon: Sun },
  { value: "dark", label: "Dark theme", icon: Moon },
];

/**
 * Sun/moon pill. Picking the other theme grows it out of the clicked icon as
 * an ink-drop blob, so the blob is the live new theme, not an overlay.
 * Browsers without View Transitions, and visitors who prefer reduced motion,
 * get an instant switch.
 */
export function ThemeToggle({ className }: { className?: string }) {
  // Null on the server and during hydration: no button shows as active until mounted.
  const theme = useSyncExternalStore(subscribe, currentTheme, () => null);

  function choose(next: AdminTheme, e: MouseEvent<HTMLButtonElement>) {
    if (theme === null || next === theme || switching) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduceMotion) {
      setTheme(next);
      return;
    }
    // Keyboard clicks have no pointer position; the button's centre works for both.
    const box = e.currentTarget.getBoundingClientRect();
    void switchWithBlob(next, box.left + box.width / 2, box.top + box.height / 2);
  }

  return (
    <div
      role="group"
      aria-label="Theme"
      className={cn("flex flex-col gap-1 rounded-full border border-line bg-surface p-1", className)}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={(e) => choose(value, e)}
            className={cn(
              "grid size-8 place-items-center rounded-full",
              active ? "bg-white text-ink shadow-card" : "text-muted hover:text-ink",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
