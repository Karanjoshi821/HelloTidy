import { useSyncExternalStore } from "react";

/**
 * The visitor's cookie choice, kept in their browser. Opt-in: until they
 * press Accept, Google Analytics, Microsoft Clarity and the Meta Pixel don't
 * load, and our own tracker counts the visit anonymously (no cookie, no IP).
 * India's DPDP Act requires this kind of consent for its notice and consent
 * rules from May 2027; it is also what the privacy policy promises.
 */

export type ConsentChoice = "granted" | "denied";

export const CONSENT_KEY = "hellotidy_consent_v1";

type Stored = { choice: ConsentChoice; at: string; v: 1 };

const listeners = new Set<() => void>();
let cached: ConsentChoice | null | undefined;
let reviewing = false;

function read(): ConsentChoice | null {
  if (cached !== undefined) return cached;
  try {
    const raw = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "null") as Partial<Stored> | null;
    cached = raw?.choice === "granted" || raw?.choice === "denied" ? raw.choice : null;
  } catch {
    cached = null;
  }
  return cached;
}

function emit() {
  listeners.forEach((l) => l());
}

/** The saved choice, or null before they answer. Browser only. */
export function getConsent(): ConsentChoice | null {
  return typeof window === "undefined" ? null : read();
}

export function analyticsAllowed(): boolean {
  return getConsent() === "granted";
}

export function chooseConsent(choice: ConsentChoice): void {
  cached = choice;
  reviewing = false;
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, at: new Date().toISOString(), v: 1 } satisfies Stored));
  } catch {
    // Storage blocked: the choice holds for this page.
  }
  emit();
}

/** Reopens the banner (footer "Cookie settings"), as the privacy policy promises. */
export function openCookieSettings(): void {
  reviewing = true;
  emit();
}

export function closeCookieSettings(): void {
  reviewing = false;
  emit();
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === CONSENT_KEY) {
      cached = undefined;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const snapshot = () => `${read() ?? "unset"}|${reviewing ? 1 : 0}`;

/** `hydrated` is false during the server render and hydration, when the choice can't be known. */
export function useConsent(): { choice: ConsentChoice | null; reviewing: boolean; hydrated: boolean } {
  const value = useSyncExternalStore(subscribeConsent, snapshot, () => "server");
  if (value === "server") return { choice: null, reviewing: false, hydrated: false };
  const [choice, open] = value.split("|");
  return { choice: choice === "unset" ? null : (choice as ConsentChoice), reviewing: open === "1", hydrated: true };
}
