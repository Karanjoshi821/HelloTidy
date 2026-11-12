import "server-only";
import { createSign } from "node:crypto";
import { firebaseConfig } from "../env";
import { forgetTokens, pushTargets, type PushKind } from "../mobile/devices";
import { formatPaise } from "../money";
import type { OrderWithItems } from "./types";

/**
 * Push notifications to the DulyPaid admin app through Firebase Cloud
 * Messaging (HTTP v1 API). Off until FIREBASE_* is set, like every other
 * integration. The app creates the Android channels; the "orders" channel
 * carries the cash-register sound, so the "cha-ching" plays even when the
 * app is closed.
 */

export type PushPayload = {
  kind: PushKind;
  title: string;
  body: string;
  /** Delivered to the app as strings; `type` + `orderId` tell it what to open. */
  data: Record<string, string>;
  /** Same tag replaces an older notification (e.g. repeated alerts for one order). */
  tag?: string;
};

const CHANNELS: Record<PushKind, { channelId: string; sound: string }> = {
  orders: { channelId: "orders", sound: "cash_register" },
  alerts: { channelId: "alerts", sound: "default" },
  messages: { channelId: "messages", sound: "default" },
};

// ─── OAuth access token (service account JWT), cached per server instance ────

let cached: { token: string; expiresAt: number } | null = null;

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export function serviceAccountJwt(clientEmail: string, privateKey: string, now = Math.floor(Date.now() / 1000)): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(privateKey).toString("base64url")}`;
}

async function accessToken(cfg: NonNullable<ReturnType<typeof firebaseConfig>>): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: serviceAccountJwt(cfg.clientEmail, cfg.privateKey),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`FCM auth failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

// ─── Messages ────────────────────────────────────────────────────────────────

export function fcmMessage(token: string, payload: PushPayload) {
  const channel = CHANNELS[payload.kind];
  return {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data: { ...payload.data, kind: payload.kind },
      android: {
        priority: "HIGH",
        ttl: payload.kind === "orders" ? "86400s" : "21600s",
        notification: {
          channel_id: channel.channelId,
          sound: channel.sound,
          tag: payload.tag,
          color: "#0f7a3c",
          notification_priority: payload.kind === "messages" ? "PRIORITY_DEFAULT" : "PRIORITY_MAX",
          visibility: "PRIVATE",
          default_vibrate_timings: true,
        },
      },
    },
  };
}

/** Errors that mean the token will never work again. */
function isDeadToken(status: number, body: string): boolean {
  return status === 404 || /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT.*token/i.test(body);
}

/** Sends one push to a list of tokens. Returns how many were accepted by FCM. */
export async function sendPush(tokens: string[], payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const cfg = firebaseConfig();
  if (!cfg || !tokens.length) return { sent: 0, failed: 0 };
  const auth = await accessToken(cfg);
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/messages:send`;
  const dead: string[] = [];
  const results = await Promise.all(
    tokens.map(async (token) => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
          body: JSON.stringify(fcmMessage(token, payload)),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) return true;
        const body = await res.text();
        if (isDeadToken(res.status, body)) dead.push(token);
        else console.error(`[push] FCM ${res.status}: ${body.slice(0, 300)}`);
        return false;
      } catch (error) {
        console.error("[push] FCM request failed:", error);
        return false;
      }
    }),
  );
  await forgetTokens(dead).catch((error) => console.error("[push] forget tokens", error));
  const sent = results.filter(Boolean).length;
  return { sent, failed: results.length - sent };
}

async function broadcast(payload: PushPayload): Promise<void> {
  if (!firebaseConfig()) return;
  const tokens = await pushTargets(payload.kind);
  if (tokens.length) await sendPush(tokens, payload);
}

// ─── What the store sends ────────────────────────────────────────────────────

export function newOrderPayload(order: OrderWithItems): PushPayload {
  const items = order.items.map((i) => `${i.name} ×${i.qty}`).join(", ");
  const pay = order.paymentMethod === "cod" ? "COD" : "Prepaid";
  return {
    kind: "orders",
    title: `New order · ${formatPaise(order.total)}`,
    body: `${order.orderNumber} · ${order.customerName}, ${order.city} · ${items} · ${pay}`,
    data: { type: "order", orderId: order.id, orderNumber: order.orderNumber },
    tag: `order-${order.id}`,
  };
}

/** The "cha-ching": every confirmed order (COD placed or online payment received). */
export async function pushNewOrder(order: OrderWithItems): Promise<void> {
  await broadcast(newOrderPayload(order));
}

export async function pushAlert(text: string, orderId?: string): Promise<void> {
  const [first, ...rest] = text.split("\n");
  await broadcast({
    kind: "alerts",
    title: "Store alert",
    body: rest.length ? `${first} (+${rest.length} more)` : first,
    data: orderId ? { type: "order", orderId } : { type: "alert" },
    tag: orderId ? `alert-${orderId}` : undefined,
  });
}

export async function pushNewMessage(input: { name: string; topic: string; message: string }): Promise<void> {
  await broadcast({
    kind: "messages",
    title: `New message from ${input.name}`,
    body: input.message.slice(0, 160),
    data: { type: "message" },
  });
}
