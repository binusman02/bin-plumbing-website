/**
 * Helper utilities for Nigerian Naira (NGN) and Africa/Lagos locale formatting.
 */

export function formatNGN(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "" || isNaN(Number(amount))) {
    return "₦0";
  }
  const num = Number(amount);
  return `₦${new Intl.NumberFormat("en-NG", {
    maximumFractionDigits: 0,
  }).format(num)}`;
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    return new Intl.DateTimeFormat("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Africa/Lagos",
    }).format(d);
  } catch {
    return String(dateString);
  }
}

export function formatDateOnly(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    return new Intl.DateTimeFormat("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Africa/Lagos",
    }).format(d);
  } catch {
    return String(dateString);
  }
}
