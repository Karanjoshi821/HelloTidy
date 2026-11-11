import type { IndianState } from "../india";

/**
 * A visitor's approximate place from Vercel's request headers (set by Vercel's
 * network on every deployed request; absent when running locally). Vercel
 * gives the state as the ISO 3166-2 code, e.g. "MH".
 */

export type Place = {
  country: string | null;
  region: string | null;
  city: string | null;
  postalCode: string | null;
};

/** ISO 3166-2:IN codes, with the codes changed in 2023 (CT→CG, OR→OD, TG→TS, UT→UK) both ways. */
const IN_REGIONS: Record<string, IndianState> = {
  AN: "Andaman and Nicobar Islands",
  AP: "Andhra Pradesh",
  AR: "Arunachal Pradesh",
  AS: "Assam",
  BR: "Bihar",
  CH: "Chandigarh",
  CT: "Chhattisgarh",
  CG: "Chhattisgarh",
  DH: "Dadra and Nagar Haveli and Daman and Diu",
  DN: "Dadra and Nagar Haveli and Daman and Diu",
  DD: "Dadra and Nagar Haveli and Daman and Diu",
  DL: "Delhi",
  GA: "Goa",
  GJ: "Gujarat",
  HR: "Haryana",
  HP: "Himachal Pradesh",
  JK: "Jammu and Kashmir",
  JH: "Jharkhand",
  KA: "Karnataka",
  KL: "Kerala",
  LA: "Ladakh",
  LD: "Lakshadweep",
  MP: "Madhya Pradesh",
  MH: "Maharashtra",
  MN: "Manipur",
  ML: "Meghalaya",
  MZ: "Mizoram",
  NL: "Nagaland",
  OR: "Odisha",
  OD: "Odisha",
  PY: "Puducherry",
  PB: "Punjab",
  RJ: "Rajasthan",
  SK: "Sikkim",
  TN: "Tamil Nadu",
  TG: "Telangana",
  TS: "Telangana",
  TR: "Tripura",
  UP: "Uttar Pradesh",
  UT: "Uttarakhand",
  UK: "Uttarakhand",
  WB: "West Bengal",
};

function decode(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value).trim().slice(0, 80) || null;
  } catch {
    return value.trim().slice(0, 80) || null;
  }
}

export function placeFromHeaders(h: Pick<Headers, "get">): Place {
  const raw = (name: string) => h.get(name)?.trim() || null;
  const countryCode = raw("x-vercel-ip-country")?.toUpperCase() ?? null;
  // "XX" is unknown, "T1" is Tor.
  const country =
    countryCode && /^[A-Z]{2}$/.test(countryCode) && countryCode !== "XX" && countryCode !== "T1" ? countryCode : null;
  const regionCode = raw("x-vercel-ip-country-region")?.toUpperCase().slice(0, 10) ?? null;
  const region = regionCode ? (country === "IN" ? (IN_REGIONS[regionCode] ?? regionCode) : regionCode) : null;
  const postal = raw("x-vercel-ip-postal-code");
  return {
    country,
    region,
    city: decode(raw("x-vercel-ip-city")),
    postalCode: postal && /^[A-Za-z0-9 -]{3,12}$/.test(postal) ? postal : null,
  };
}

/** "Mumbai, Maharashtra" / "Maharashtra" / "US" / "Unknown". */
export function placeLabel(p: { city?: string | null; region?: string | null; country?: string | null }): string {
  const parts = [p.city, p.region].filter(Boolean);
  if (parts.length) return parts.join(", ") + (p.country && p.country !== "IN" ? ` (${p.country})` : "");
  return p.country ?? "Unknown";
}
