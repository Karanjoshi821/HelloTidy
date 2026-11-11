import { uuid } from "../client-id";
import { getConsent, type ConsentChoice } from "../consent";
import { isPrivatePath } from "./attribution";
import type { VisitEventName } from "./schema";

/**
 * Browser half of our own visitor tracking; what is kept for whom is decided
 * in service.ts. Adapted from skelmet (features/visitors/lib/tracker.ts).
 * Browser only.
 */

const ENDPOINT = "/api/visits";
const VISIT_KEY = "hellotidy_visit_v1";
/** Idle time that ends a visit, as analytics tools count one. */
const VISIT_IDLE_MS = 30 * 60_000;
/** No tap, scroll or key for this long: nobody is reading. */
const IDLE_MS = 30_000;

type Message = { t: string } & Record<string, unknown>;

let visitInMemory: { id: string; at: number } | null = null;

/** Per tab, in sessionStorage. Deliberately not a cookie: it is only sent inside these messages. */
export function visitId(): string {
  const now = Date.now();
  let visit = visitInMemory;
  try {
    const raw = sessionStorage.getItem(VISIT_KEY);
    if (raw) visit = JSON.parse(raw) as { id: string; at: number };
  } catch {
    // Storage blocked: the copy in memory will do.
  }
  if (!visit || typeof visit.id !== "string" || now - Number(visit.at) > VISIT_IDLE_MS) visit = { id: uuid(), at: now };
  visit = { id: visit.id, at: now };
  visitInMemory = visit;
  try {
    sessionStorage.setItem(VISIT_KEY, JSON.stringify(visit));
  } catch {
    // As above.
  }
  return visit.id;
}

const granted = () => getConsent() === "granted";

function post(body: string, beacon: boolean): Promise<unknown> {
  // A beacon outlives a closing page; text/plain is the type every browser accepts for one.
  if (beacon && typeof navigator.sendBeacon === "function") {
    if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }))) return Promise.resolve();
  }
  return fetch(ENDPOINT, {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => undefined);
}

// Strictly in order: the first answer sets the cookie, and a racing message would make a second visitor.
let queue: Promise<unknown> = Promise.resolve();
function enqueue(work: () => Promise<unknown>): void {
  queue = queue.then(work).catch(() => undefined);
}

function send(message: Message, options: { sid?: string; beacon?: boolean } = {}): void {
  const body = () => JSON.stringify({ ...message, sid: options.sid ?? visitId(), consent: granted() });
  if (options.beacon) {
    void post(body(), true);
    return;
  }
  enqueue(() => post(body(), false));
}

type Device = { screen?: string; lang?: string; tz?: string; touch?: number; model?: string; platformVersion?: string };
type UserAgentData = { getHighEntropyValues(hints: string[]): Promise<{ model?: string; platformVersion?: string }> };

let deviceOnce: Promise<Device> | null = null;
function device(): Promise<Device> {
  deviceOnce ??= (async () => {
    const found: Device = {
      screen: `${window.screen.width}x${window.screen.height}`,
      lang: navigator.language?.slice(0, 35),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone?.slice(0, 60),
      touch: Math.min(32, navigator.maxTouchPoints ?? 0),
    };
    // Chrome on Android leaves the model and version out of its user agent, but answers this.
    const uaData = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData;
    if (uaData) {
      try {
        const high = await Promise.race([
          uaData.getHighEntropyValues(["model", "platformVersion"]),
          new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 500)),
        ]);
        if (high?.model) found.model = high.model.slice(0, 60);
        if (high?.platformVersion) found.platformVersion = high.platformVersion.slice(0, 30);
      } catch {
        // Not offered: the user agent will do.
      }
    }
    return found;
  })();
  return deviceOnce;
}

// ── time on page ──────────────────────────────────────────
let page: { pv: string; sid: string; path: string; at: number } | null = null;
let engagedMs = 0;
let lastTick = 0;
let lastInput = 0;
let firstView = true;

function tick(visible = document.visibilityState === "visible"): void {
  const now = performance.now();
  if (visible && now - lastInput < IDLE_MS) engagedMs += now - lastTick;
  lastTick = now;
}

function flushTime(beacon: boolean): void {
  tick();
  const seconds = Math.floor(engagedMs / 1000);
  if (!page || seconds < 1) return;
  engagedMs -= seconds * 1000;
  send({ t: "time", pv: page.pv, s: Math.min(seconds, 1800) }, { sid: page.sid, beacon });
}

/** Called on the first page and on every route change. */
export function trackPage(path: string): void {
  // React runs a new effect twice in development.
  if (page && page.path === path && performance.now() - page.at < 1000) return;

  flushTime(false);
  if (isPrivatePath(path)) {
    page = null;
    return;
  }
  const sid = visitId();
  const pv = uuid();
  const now = performance.now();
  page = { pv, sid, path, at: now };
  engagedMs = 0;
  lastTick = now;
  lastInput = now;

  // The referrer means something only on the first page.
  const ref = firstView && document.referrer ? document.referrer.slice(0, 1000) : undefined;
  firstView = false;

  enqueue(async () => {
    const all = await device();
    // The phone model only with consent: it narrows one device down a long way.
    const { model, ...coarse } = all;
    const facts = granted() && model ? { ...coarse, model } : coarse;
    return post(JSON.stringify({ t: "view", pv, path, ref, device: facts, sid, consent: granted() }), false);
  });
}

/** Counts engaged time on the page. Returns the cleanup. */
export function startEngagement(): () => void {
  const onInput = () => {
    tick();
    lastInput = performance.now();
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      // Already hidden when this runs, but the time up to now was visible.
      tick(true);
      flushTime(true);
    } else {
      lastTick = performance.now();
      lastInput = lastTick;
    }
  };
  const onHide = () => flushTime(true);

  const timer = window.setInterval(() => tick(), 5000);
  const events = ["pointerdown", "pointermove", "keydown", "scroll", "wheel", "touchstart"];
  for (const name of events) window.addEventListener(name, onInput, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onHide);

  return () => {
    window.clearInterval(timer);
    for (const name of events) window.removeEventListener(name, onInput);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onHide);
  };
}

/** An action on the current page, e.g. a PIN check. Small flat data only. */
export function reportVisitEvent(name: VisitEventName, data?: Record<string, string | number | boolean | null>): void {
  if (typeof window === "undefined") return;
  const path = window.location.pathname + window.location.search;
  if (isPrivatePath(path)) return;
  send({ t: "event", name, path, ...(data ? { data } : {}) });
}

/** Accepting starts recognising the device; declining after accepting forgets it. */
export function reportConsent(next: ConsentChoice, previous: ConsentChoice | null): void {
  if (next === "granted" || previous === "granted") send({ t: "consent" });
}
