export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

export type IndianState = (typeof INDIAN_STATES)[number];

const aliases: Record<string, IndianState> = {
  "nct of delhi": "Delhi",
  "new delhi": "Delhi",
  orissa: "Odisha",
  pondicherry: "Puducherry",
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  "the dadra and nagar haveli and daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  "jammu & kashmir": "Jammu and Kashmir",
  "andaman & nicobar islands": "Andaman and Nicobar Islands",
  "andaman and nicobar": "Andaman and Nicobar Islands",
  uttaranchal: "Uttarakhand",
};

/** Maps a free-form state name (e.g. from the India Post API) to our list. */
export function matchState(name: string | undefined | null): IndianState | null {
  if (!name) return null;
  const key = name.trim().toLowerCase().replace(/\s+/g, " ");
  const exact = INDIAN_STATES.find((s) => s.toLowerCase() === key);
  return exact ?? aliases[key] ?? null;
}

/**
 * Normalises an Indian mobile number to 10 digits.
 * Accepts "+91 98765 43210", "09876543210", "98765-43210" etc.
 */
export function normalizeIndianMobile(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export function isValidPincode(pin: string): boolean {
  return /^[1-9]\d{5}$/.test(pin);
}
