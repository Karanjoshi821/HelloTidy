import "server-only";
import { cacheLife } from "next/cache";
import { matchState } from "./india";

export type PincodeResult = { ok: true; city: string; state: string | null } | { ok: false };

type IndiaPostResponse = {
  Status: string;
  PostOffice: { District: string; State: string }[] | null;
}[];

/** India Post lookup, cached for weeks. Throws on network errors so failures are not cached. */
async function fetchPincode(pin: string): Promise<PincodeResult> {
  "use cache";
  cacheLife("weeks");
  const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, {
    signal: AbortSignal.timeout(5000),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`India Post responded ${res.status}`);
  const data = (await res.json()) as IndiaPostResponse;
  const office = data[0]?.Status === "Success" ? data[0].PostOffice?.[0] : undefined;
  if (!office) return { ok: false };
  return { ok: true, city: office.District, state: matchState(office.State) };
}

export async function lookupPincode(pin: string): Promise<PincodeResult> {
  try {
    return await fetchPincode(pin);
  } catch (error) {
    console.warn("[pincode] lookup failed:", error instanceof Error ? error.message : error);
    return { ok: false };
  }
}
