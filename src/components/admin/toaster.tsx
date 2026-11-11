"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CircleCheck, CircleX, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Admin toasts: short confirmations ("Status updated.") and errors that
 * appear in a corner and close on their own. Call `toast()` from any client
 * component; <Toaster /> in the admin layout shows them.
 */

export type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; tone: ToastTone; message: string; at: number };

const MAX_VISIBLE = 4;
const DURATION_MS: Record<ToastTone, number> = { success: 4000, info: 5000, error: 8000 };

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, tone: ToastTone = "success"): void {
  const text = message.trim();
  if (!text) return;
  const last = items[items.length - 1];
  // A double click or a re-render shouldn't stack the same message twice.
  if (last && last.message === text && last.tone === tone && Date.now() - last.at < 1500) return;
  items = [...items, { id: nextId++, tone, message: text, at: Date.now() }].slice(-MAX_VISIBLE);
  emit();
}
toast.success = (message: string) => toast(message, "success");
toast.error = (message: string) => toast(message, "error");
toast.info = (message: string) => toast(message, "info");

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => items;
const serverSnapshot = (): ToastItem[] => [];

const icons = { success: CircleCheck, error: CircleX, info: Info };
const iconTone = { success: "text-success", error: "text-danger", info: "text-brand" };

function Toast({ item }: { item: ToastItem }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(DURATION_MS[item.tone]);

  // Counts down only while the toast isn't hovered or focused.
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => dismiss(item.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused, item.id]);

  const Icon = icons[item.tone];
  return (
    <li
      role={item.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "animate-toast-in pointer-events-auto flex items-start gap-3 rounded-2xl border bg-white p-3.5 pr-2.5 text-sm text-ink shadow-card",
        item.tone === "error" ? "border-danger/40" : "border-line",
      )}
    >
      <Icon className={cn("mt-px size-5 shrink-0", iconTone[item.tone])} aria-hidden="true" />
      <p className="min-w-0 flex-1 leading-snug font-medium break-words whitespace-pre-line">{item.message}</p>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label="Dismiss notification"
        className="-mt-1 grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
      >
        <X className="size-4" />
      </button>
    </li>
  );
}

/** Renders the toasts. Mount once, inside the admin's themed wrapper. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return (
    <section aria-label="Notifications" className="pointer-events-none fixed inset-x-3 bottom-3 z-[70] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px]">
      <ol className="flex flex-col gap-2">
        {list.map((item) => (
          <Toast key={item.id} item={item} />
        ))}
      </ol>
    </section>
  );
}

/**
 * Toasts each new `{ ok, message }` result from a form action. Every submit
 * returns a new object, so this fires once per save.
 */
export function useResultToast(state: { ok: boolean; message: string } | null | undefined) {
  useEffect(() => {
    if (state?.message) toast(state.message, state.ok ? "success" : "error");
  }, [state]);
}

/** Shows one toast when a page opens after a redirect (e.g. ?created=1), then drops the flag from the address. */
export function FlashToast({ param, message, tone = "success" }: { param: string; message: string; tone?: ToastTone }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(param)) return;
    toast(message, tone);
    url.searchParams.delete(param);
    // Next.js keeps its router in step with history.replaceState, so a refresh won't toast again.
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [param, message, tone]);
  return null;
}
