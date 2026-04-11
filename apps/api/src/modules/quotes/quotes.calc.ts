/**
 * Pure money math for quotes.
 *
 * All amounts are in minor units (paise/cents) — never floats. This keeps
 * rounding deterministic and avoids the floating-point drift that plagues
 * naive `subtotal * 1.18` computations.
 *
 * Discount and tax bps are 0–10000 (e.g. 1500 = 15.00%).
 */

export interface LineItemForCalc {
  quantity: number;
  unitPrice: number;
  discountBps?: number;
}

export interface QuoteTotalsInput {
  lineItems: LineItemForCalc[];
  /** Quote-level flat discount (not percent). */
  discount?: number;
  /** Tax percent in bps applied to (subtotal − discount). */
  taxBps?: number;
}

export interface QuoteTotals {
  /** Sum of line item totals BEFORE quote-level discount or tax. */
  subtotal: number;
  /** Quote-level discount as applied. Cannot exceed subtotal. */
  discount: number;
  /** Tax amount computed as (subtotal − discount) × taxBps / 10000. */
  tax: number;
  /** Grand total. */
  total: number;
}

/**
 * Compute a single line item's total after per-line discount.
 * Exposed so callers can display the pre-stored value, even when the
 * service is mid-write.
 */
export function lineItemTotal(
  quantity: number,
  unitPrice: number,
  discountBps = 0,
): number {
  const q = Math.max(0, Math.floor(quantity));
  const p = Math.max(0, Math.floor(unitPrice));
  const gross = q * p;
  const d = Math.min(10_000, Math.max(0, Math.floor(discountBps)));
  if (d === 0) return gross;
  // Round HALF_UP to nearest minor unit.
  return Math.round(gross - (gross * d) / 10_000);
}

/**
 * Compute all quote-level totals from a line item list + discount + tax bps.
 * Deterministic: same input always produces the same output.
 */
export function computeQuoteTotals(input: QuoteTotalsInput): QuoteTotals {
  let subtotal = 0;
  for (const li of input.lineItems) {
    subtotal += lineItemTotal(li.quantity, li.unitPrice, li.discountBps);
  }
  const rawDiscount = Math.max(0, Math.floor(input.discount ?? 0));
  const discount = Math.min(subtotal, rawDiscount);
  const taxBase = Math.max(0, subtotal - discount);
  const taxBps = Math.max(0, Math.min(10_000, Math.floor(input.taxBps ?? 0)));
  const tax = Math.round((taxBase * taxBps) / 10_000);
  const total = taxBase + tax;
  return { subtotal, discount, tax, total };
}

/**
 * Format a minor-unit amount as a human-readable currency string.
 * Not used by the service itself — only exposed for tool responses.
 */
export function formatMinor(amount: number, currency = 'INR'): string {
  const major = amount / 100;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}

/**
 * Generate a human-readable quote number in the form `Q-YYMMDD-XXX` where
 * XXX is a short random suffix. Callers must still check uniqueness per
 * company and retry on collision.
 */
export function generateQuoteNumber(now: Date = new Date()): string {
  const yy = String(now.getFullYear() % 100).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `Q-${yy}${mm}${dd}-${rand}`;
}
