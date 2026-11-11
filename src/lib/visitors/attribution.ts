/**
 * Where a visit came from, worked out on its first page. Precedence: UTM tags,
 * then ad click ids, then the referrer (an Android app, a search engine, a
 * social site, any other site), then the in-app browser, otherwise "direct".
 * Adapted from skelmet (features/visitors/server/attribution.ts).
 */

export type Arrival = {
  /** Without its query string. */
  referrer: string | null;
  /** "instagram", "google", "direct", or utm_source. */
  source: string;
  /** "social", "organic", "cpc", "referral", "email", or utm_medium. */
  medium: string | null;
  campaign: string | null;
};

/**
 * Privacy: only these URL parameters are ever stored, so nothing personal in
 * a link (a phone number, an order token) reaches the database.
 */
const KEPT_PARAMS = new Set(["pack", "qty", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]);

const BASE = "https://hellotidy.invalid";

/** Paths never recorded: order pages carry a private token, and staff areas aren't the store. */
export function isPrivatePath(path: string): boolean {
  return /^\/(order|admin|api)(\/|$)/.test(path);
}

/** The path with only the allow-listed parameters, e.g. "/products/x?pack=pack-50". */
export function cleanPath(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return "/";
  }
  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (KEPT_PARAMS.has(key)) kept.append(key, value.slice(0, 100));
  }
  const query = kept.toString();
  return (url.pathname.slice(0, 200) || "/") + (query ? `?${query}` : "");
}

const SEARCH: [RegExp, string][] = [
  [/(^|\.)google\./, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)yahoo\./, "yahoo"],
  [/(^|\.)yandex\./, "yandex"],
  [/(^|\.)ecosia\.org$/, "ecosia"],
  [/(^|\.)(chatgpt\.com|chat\.openai\.com)$/, "chatgpt"],
  [/(^|\.)perplexity\.ai$/, "perplexity"],
];

const SOCIAL: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "facebook"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "x"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "whatsapp"],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, "linkedin"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)pinterest\./, "pinterest"],
  [/(^|\.)snapchat\.com$/, "snapchat"],
  [/(^|\.)threads\.(net|com)$/, "threads"],
  [/(^|\.)(telegram\.org|telegram\.me|t\.me)$/, "telegram"],
];

/** Android apps open links with their package name as the referrer. */
const APPS: Record<string, [source: string, medium: string]> = {
  "com.instagram.android": ["instagram", "social"],
  "com.facebook.katana": ["facebook", "social"],
  "com.facebook.orca": ["messenger", "social"],
  "com.whatsapp": ["whatsapp", "social"],
  "com.whatsapp.w4b": ["whatsapp", "social"],
  "com.google.android.gm": ["gmail", "email"],
  "com.google.android.googlequicksearchbox": ["google", "organic"],
  "com.google.android.youtube": ["youtube", "social"],
  "org.telegram.messenger": ["telegram", "social"],
  "com.linkedin.android": ["linkedin", "social"],
  "com.twitter.android": ["x", "social"],
};

type Referrer = { url: string; host: string; app: string | null };

function parseReferrer(raw: string | null | undefined, ownHost: string | null | undefined): Referrer | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol === "android-app:") {
    const app = url.hostname.toLowerCase();
    return app ? { url: `android-app://${app}`, host: app, app } : null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const bare = (h: string) => h.toLowerCase().replace(/^www\./, "");
  const host = bare(url.hostname);
  // Our own pages are not an arrival.
  if (ownHost && host === bare(ownHost.split(":")[0] ?? "")) return null;
  return { url: `${url.origin}${url.pathname}`.slice(0, 300), host, app: null };
}

export function arrivalOf(input: {
  path: string;
  referrer?: string | null;
  ownHost?: string | null;
  userAgent?: string | null;
}): Arrival {
  let params: URLSearchParams;
  try {
    params = new URL(input.path, BASE).searchParams;
  } catch {
    params = new URLSearchParams();
  }
  const tag = (key: string) => params.get(key)?.trim().toLowerCase().slice(0, 100) || null;
  const ua = input.userAgent ?? "";
  const ref = parseReferrer(input.referrer, input.ownHost);
  const referrer = ref?.url ?? null;

  const utmSource = tag("utm_source");
  if (utmSource) return { referrer, source: utmSource, medium: tag("utm_medium"), campaign: tag("utm_campaign") };

  // Ad clicks carry a click id even on untagged links.
  if (params.has("gclid") || params.has("gbraid") || params.has("wbraid")) {
    return { referrer, source: "google", medium: "cpc", campaign: null };
  }
  if (params.has("msclkid")) return { referrer, source: "bing", medium: "cpc", campaign: null };
  if (params.has("fbclid")) {
    const insta = ref?.host.includes("instagram") || /Instagram/.test(ua);
    return { referrer, source: insta ? "instagram" : "facebook", medium: "social", campaign: null };
  }

  if (ref) {
    if (ref.app) {
      const [source, medium] = APPS[ref.app] ?? [ref.app, "app"];
      return { referrer, source, medium, campaign: null };
    }
    for (const [pattern, source] of SEARCH) {
      if (pattern.test(ref.host)) return { referrer, source, medium: "organic", campaign: null };
    }
    for (const [pattern, source] of SOCIAL) {
      if (pattern.test(ref.host)) return { referrer, source, medium: "social", campaign: null };
    }
    return { referrer, source: ref.host, medium: "referral", campaign: null };
  }

  // No referrer, but the in-app browser gives it away.
  if (/Instagram/.test(ua)) return { referrer, source: "instagram", medium: "social", campaign: null };
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return { referrer, source: "facebook", medium: "social", campaign: null };

  return { referrer: null, source: "direct", medium: null, campaign: null };
}
