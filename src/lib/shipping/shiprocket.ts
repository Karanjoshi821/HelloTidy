import "server-only";
import { cacheLife } from "next/cache";
import { shiprocketConfig } from "../env";

/**
 * Minimal Shiprocket API client (https://apiv2.shiprocket.in/v1/external).
 *
 * Everything here is free: logging in, checking a pincode, and creating,
 * updating, cancelling or printing the invoice of an order. Money leaves the
 * Shiprocket wallet only when a courier is booked for a shipment (AWB), which
 * this store never does through the API.
 */

const API = "https://apiv2.shiprocket.in/v1/external";

export class ShiprocketError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ShiprocketError";
  }
}

type Config = NonNullable<ReturnType<typeof shiprocketConfig>>;

function requireConfig(): Config {
  const config = shiprocketConfig();
  if (!config) throw new ShiprocketError("Shiprocket is not configured", 0);
  return config;
}

// Tokens last days; keep one per server instance for a few hours, and log in
// again early rather than hold a token that is about to expire.
let cachedToken: { value: string; expiresAt: number } | null = null;
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

// Shiprocket locks the API user for hours after repeated failed logins. One
// failure (wrong password, account locked) pauses logins for this long, so a
// bad setting costs one attempt every few minutes, never a lock-out.
let loginPausedUntil = 0;
let lastLoginError = "";
const LOGIN_PAUSE_MS = 10 * 60 * 1000;

async function token(config: Config): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  if (Date.now() < loginPausedUntil) throw new ShiprocketError(`login paused after: ${lastLoginError}`, 0);
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: config.email, password: config.password }),
    signal: AbortSignal.timeout(8000),
  });
  const data = (await res.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!res.ok || !data.token) {
    lastLoginError = data.message ?? `HTTP ${res.status}`;
    // Network blips (5xx) may retry sooner; a refused login waits the full pause.
    loginPausedUntil = Date.now() + (res.status >= 500 ? 60_000 : LOGIN_PAUSE_MS);
    throw new ShiprocketError(`login failed: ${lastLoginError}`, res.status);
  }
  cachedToken = { value: data.token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return data.token;
}

function errorMessage(data: unknown, status: number): string {
  const d = data as { message?: string; errors?: Record<string, string[] | string> } | null;
  const details = d?.errors
    ? Object.entries(d.errors)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
        .join("; ")
    : "";
  return [d?.message, details].filter(Boolean).join(" ") || `HTTP ${status}`;
}

async function request<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}, retry = true): Promise<T> {
  const config = requireConfig();
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${await token(config)}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 401 && retry) {
    cachedToken = null;
    return request<T>(path, init, false);
  }
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new ShiprocketError(errorMessage(data, res.status), res.status);
  return data as T;
}

// ---------------------------------------------------------------- pincodes ----

export type Serviceability = {
  serviceable: boolean;
  /** Any courier at this pincode collects cash. */
  cod: boolean;
  /** Courier days from pickup to delivery (not counting our dispatch time). */
  days: number | null;
  city: string | null;
  state: string | null;
};

type Courier = {
  courier_name: string;
  estimated_delivery_days?: string | number;
  cod?: number;
  blocked?: number;
  city?: string;
  state?: string;
};

/** Pure: reduce Shiprocket's courier list to what a shopper needs. */
export function summariseCouriers(couriers: Courier[]): Serviceability {
  const usable = couriers.filter((c) => !c.blocked);
  if (!usable.length) return { serviceable: false, cod: false, days: null, city: null, state: null };
  const dayOf = (c: Courier) => {
    const n = Number.parseInt(String(c.estimated_delivery_days ?? ""), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  // The vendor ships with Delhivery, so its estimate is the honest one when it's listed.
  const preferred = usable.filter((c) => /delhivery/i.test(c.courier_name) && dayOf(c));
  const pool = (preferred.length ? preferred : usable).map(dayOf).filter((d): d is number => d !== null);
  const first = usable[0]!;
  return {
    serviceable: true,
    cod: usable.some((c) => c.cod === 1),
    days: pool.length ? Math.min(...pool) : null,
    city: first.city ?? null,
    state: first.state ?? null,
  };
}

const NOT_SERVICEABLE: Serviceability = { serviceable: false, cod: false, days: null, city: null, state: null };

/**
 * Cached per pincode for about an hour. "No courier serves this pincode" is
 * an answer and is cached; any other failure throws and is not. (Errors lose
 * their details when they leave a cached scope, so the 404 is decided here.)
 */
async function fetchServiceability(pickup: string, pin: string): Promise<Serviceability> {
  "use cache";
  cacheLife("hours");
  try {
    const data = await request<{ data?: { available_courier_companies?: Courier[] }; status?: number }>(
      `/courier/serviceability/?pickup_postcode=${pickup}&delivery_postcode=${pin}&weight=0.5&cod=0`,
    );
    return summariseCouriers(data.data?.available_courier_companies ?? []);
  } catch (error) {
    if (error instanceof ShiprocketError && error.status === 404) return NOT_SERVICEABLE;
    console.warn("[shiprocket] serviceability failed:", error instanceof Error ? error.message : error);
    throw error;
  }
}

/** null when Shiprocket isn't set up or didn't answer: callers fall back gracefully. */
export async function checkServiceability(pin: string): Promise<Serviceability | null> {
  const config = shiprocketConfig();
  if (!config) return null;
  try {
    return await fetchServiceability(config.pickupPincode, pin);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ orders ----

export type ShiprocketOrderPayload = Record<string, unknown> & { order_id: string };

export async function createShiprocketOrder(payload: ShiprocketOrderPayload) {
  return request<{ order_id?: number; shipment_id?: number; status?: string; message?: string }>(
    "/orders/create/adhoc",
    { method: "POST", body: payload },
  );
}

export async function updateShiprocketOrder(payload: ShiprocketOrderPayload) {
  return request<{ order_id?: number; shipment_id?: number; status?: string }>("/orders/update/adhoc", {
    method: "POST",
    body: payload,
  });
}

export async function cancelShiprocketOrder(shiprocketOrderId: string) {
  return request<unknown>("/orders/cancel", { method: "POST", body: { ids: [Number(shiprocketOrderId)] } });
}

export async function shiprocketInvoiceUrl(shiprocketOrderId: string): Promise<string> {
  const data = await request<{ is_invoice_created?: boolean; invoice_url?: string }>("/orders/print/invoice", {
    method: "POST",
    body: { ids: [String(shiprocketOrderId)] },
  });
  if (!data.invoice_url) throw new ShiprocketError("Shiprocket didn't return an invoice", 0);
  return data.invoice_url;
}
