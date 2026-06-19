/** Format a PKR amount with thousands separators, e.g. "Rs. 2,000,000". */
export function pkr(amount: number): string {
  const n = Math.round(amount);
  const sign = n < 0 ? "-" : "";
  return `${sign}Rs. ${Math.abs(n).toLocaleString("en-US")}`;
}

/** Compact form for tight UI spots, e.g. "Rs. 2.0M" / "Rs. 750k". */
export function pkrShort(amount: number): string {
  const n = Math.round(amount);
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}Rs. ${(a / 1_000_000).toFixed(a % 1_000_000 === 0 ? 0 : 1)}M`;
  if (a >= 1_000) return `${sign}Rs. ${Math.round(a / 1_000)}k`;
  return `${sign}Rs. ${a}`;
}
