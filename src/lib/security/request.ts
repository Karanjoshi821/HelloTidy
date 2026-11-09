import "server-only";
import { headers } from "next/headers";
import { appSecret } from "../env";
import { sha256Hex } from "./crypto";

export type RequestContext = {
  ip: string;
  ipHash: string;
  userAgent: string;
};

/**
 * Client IP as reported by the platform. On Vercel, x-forwarded-for is set by
 * the edge network and cannot be spoofed by the client.
 */
export async function getRequestContext(): Promise<RequestContext> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = h.get("x-real-ip")?.trim() || forwarded || "0.0.0.0";
  return {
    ip,
    ipHash: sha256Hex(`${appSecret()}:${ip}`).slice(0, 32),
    userAgent: (h.get("user-agent") ?? "").slice(0, 400),
  };
}
