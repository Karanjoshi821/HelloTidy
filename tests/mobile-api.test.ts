import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runAction, toFormData } from "@/lib/mobile/actions";
import { ApiError, authRedirectError, navigationTarget } from "@/lib/mobile/http";
import { dispatch, type Route } from "@/lib/mobile/router";
import { fcmMessage, newOrderPayload, serviceAccountJwt } from "@/lib/notify/push";
import type { OrderWithItems } from "@/lib/notify/types";

/** A thrown Next.js redirect, as redirect() produces it. */
function redirectError(to: string) {
  return Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
}

describe("toFormData (JSON → the form the web admin posts)", () => {
  it("writes text, ticks checkboxes for true, omits false/null and repeats arrays", () => {
    const fd = toFormData({ orderId: "a", qty: 2, restock: true, waive: false, note: null, ids: ["x", "y"], lines: [{ packId: "p", qty: 1 }] });
    expect(fd.get("orderId")).toBe("a");
    expect(fd.get("qty")).toBe("2");
    expect(fd.get("restock")).toBe("true");
    expect(fd.has("waive")).toBe(false);
    expect(fd.has("note")).toBe(false);
    expect(fd.getAll("ids")).toEqual(["x", "y"]);
    expect(JSON.parse(String(fd.get("lines")))).toEqual([{ packId: "p", qty: 1 }]);
  });
});

describe("runAction", () => {
  it("passes the action's result through", async () => {
    const result = await runAction(async (_p, fd) => ({ ok: true, message: `Saved ${fd.get("notes")}` }), { notes: "hi" });
    expect(result).toEqual({ ok: true, message: "Saved hi" });
  });

  it("returns the one-time password for staff actions", async () => {
    const result = await runAction(async () => ({ ok: true, message: "Added", secret: "temp-123" }), {});
    expect(result.secret).toBe("temp-123");
  });

  it("turns a 'created' redirect into the new id", async () => {
    const result = await runAction(async () => {
      throw redirectError("/admin/orders/1b4e28ba-2fa1-11d2-883f-0016d3cca427?created=1");
    }, {});
    expect(result).toEqual({ ok: true, message: "Created.", created: { type: "order", id: "1b4e28ba-2fa1-11d2-883f-0016d3cca427" } });
  });

  it("reports deletes", async () => {
    const result = await runAction(async () => {
      throw redirectError("/admin/discounts?deleted=1");
    }, {});
    expect(result).toEqual({ ok: true, message: "Deleted.", deleted: true });
  });

  it("maps requireOwner's redirect to a 403 for staff", async () => {
    const run = runAction(async () => {
      throw redirectError("/admin?denied=1");
    }, {});
    await expect(run).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("rethrows real errors", async () => {
    await expect(runAction(async () => Promise.reject(new Error("db down")), {})).rejects.toThrow("db down");
  });
});

describe("navigation errors", () => {
  it("reads redirect targets and 404s", () => {
    expect(navigationTarget(redirectError("/admin/login"))).toEqual({ kind: "redirect", to: "/admin/login" });
    expect(navigationTarget({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })).toEqual({ kind: "notFound" });
    expect(navigationTarget(new Error("x"))).toBeNull();
  });

  it("maps auth redirects to API errors", () => {
    expect(authRedirectError("/admin/login")?.status).toBe(401);
    expect(authRedirectError("/admin/account?setup=1")?.code).toBe("password_change_required");
    expect(authRedirectError("/admin?denied=1")?.code).toBe("forbidden");
    expect(authRedirectError("/admin/orders/x")).toBeNull();
  });
});

describe("router", () => {
  const routes: Route[] = [
    { method: "GET", path: "ping", access: "public", handler: async ({ query }) => ({ pong: query.get("n") }) },
    { method: "GET", path: "items/:id", access: "public", handler: async ({ params }) => ({ id: params.id }) },
    { method: "POST", path: "echo", access: "public", handler: async ({ body }) => body },
    {
      method: "GET",
      path: "boom",
      access: "public",
      handler: async () => {
        throw new ApiError(422, "invalid", "Nope");
      },
    },
  ];
  const req = (url: string, init?: RequestInit) => new Request(`https://x.test/api/mobile/v1/${url}`, init);

  it("matches paths and params", async () => {
    expect(await (await dispatch(routes, "GET", ["ping"], req("ping?n=3"))).json()).toEqual({ pong: "3" });
    expect(await (await dispatch(routes, "GET", ["items", "abc"], req("items/abc"))).json()).toEqual({ id: "abc" });
  });

  it("reads JSON bodies and rejects non-objects", async () => {
    const ok = await dispatch(routes, "POST", ["echo"], req("echo", { method: "POST", body: JSON.stringify({ a: 1 }) }));
    expect(await ok.json()).toEqual({ a: 1 });
    const bad = await dispatch(routes, "POST", ["echo"], req("echo", { method: "POST", body: "[1]" }));
    expect(bad.status).toBe(422);
  });

  it("answers 404 for unknown paths, 405 for the wrong method, and JSON errors", async () => {
    expect((await dispatch(routes, "GET", ["nope"], req("nope"))).status).toBe(404);
    expect((await dispatch(routes, "DELETE", ["ping"], req("ping", { method: "DELETE" }))).status).toBe(405);
    const boom = await dispatch(routes, "GET", ["boom"], req("boom"));
    expect(boom.status).toBe(422);
    expect(await boom.json()).toEqual({ error: { code: "invalid", message: "Nope" } });
  });
});

describe("push (FCM HTTP v1)", () => {
  const order = {
    id: "o1",
    orderNumber: "HT-7K3P9Q",
    total: 54900,
    customerName: "Priya Sharma",
    city: "Pune",
    paymentMethod: "cod",
    items: [{ name: "Home Pack", qty: 1 }],
  } as unknown as OrderWithItems;

  it("builds the new-order notification", () => {
    const p = newOrderPayload(order);
    expect(p.kind).toBe("orders");
    expect(p.title).toBe("New order · ₹549");
    expect(p.body).toBe("HT-7K3P9Q · Priya Sharma, Pune · Home Pack ×1 · COD");
    expect(p.data).toEqual({ type: "order", orderId: "o1", orderNumber: "HT-7K3P9Q" });
  });

  it("puts new orders on the cha-ching channel with high priority", () => {
    const m = fcmMessage("tok", newOrderPayload(order)).message;
    expect(m.token).toBe("tok");
    expect(m.android.priority).toBe("HIGH");
    expect(m.android.notification.channel_id).toBe("orders");
    expect(m.android.notification.sound).toBe("cash_register");
    expect(m.data).toMatchObject({ kind: "orders", orderId: "o1" });
    for (const v of Object.values(m.data)) expect(typeof v).toBe("string");
  });

  it("signs the service-account JWT with RS256", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const jwt = serviceAccountJwt("bot@proj.iam.gserviceaccount.com", pem, 1_700_000_000);
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(c, "base64url").toString());
    expect(claims).toMatchObject({ iss: "bot@proj.iam.gserviceaccount.com", aud: "https://oauth2.googleapis.com/token", exp: 1_700_003_600 });
    expect(claims.scope).toContain("firebase.messaging");
    const v = createVerify("RSA-SHA256");
    v.update(`${h}.${c}`);
    expect(v.verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
  });
});
