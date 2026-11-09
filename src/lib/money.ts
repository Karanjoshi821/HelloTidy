/** Amounts in the database and in pricing are integer paise. */

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrExact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats rupees: whole amounts without decimals ("₹1,099"), others with two ("₹543.10"). */
export function formatRupees(rupees: number): string {
  return Number.isInteger(rupees) ? inrWhole.format(rupees) : inrExact.format(rupees);
}

/** Formats paise, e.g. 54900 → "₹549". */
export function formatPaise(paise: number): string {
  return formatRupees(paiseToRupees(paise));
}
