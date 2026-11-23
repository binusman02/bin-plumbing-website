export function isValidInternalProofPath(raw?: string | null): boolean {
  if (!raw || typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.includes("\\")) return false;
  if (trimmed.startsWith("/api/chat/file/")) {
    const filePart = trimmed.slice("/api/chat/file/".length);
    return filePart.length > 0 && !filePart.includes("/");
  }
  return /^(?:chat-uploads|payment-proofs)\/[a-zA-Z0-9._-]+$/.test(trimmed);
}

export function computeAuthorizedPaymentAmount(params: {
  approvedQuoteTotal: number;
  alreadyPaidTotal: number;
  requestedAmount?: unknown;
}): { ok: true; amount: number; outstanding: number } | { ok: false; error: string } {
  const quoteTotal = Math.max(0, Number(params.approvedQuoteTotal) || 0);
  const alreadyPaid = Math.max(0, Number(params.alreadyPaidTotal) || 0);
  if (quoteTotal <= 0) {
    return { ok: false, error: "An approved quotation with a valid total is required before payment." };
  }
  const outstanding = Math.max(0, Math.round((quoteTotal - alreadyPaid) * 100) / 100);
  if (outstanding <= 0) {
    return { ok: false, error: "This quotation has already been paid in full." };
  }

  const parsedReq =
    params.requestedAmount !== undefined && params.requestedAmount !== null && params.requestedAmount !== ""
      ? Number(params.requestedAmount)
      : outstanding;

  if (!Number.isFinite(parsedReq) || parsedReq <= 0) {
    return { ok: false, error: "Payment amount must be greater than zero." };
  }
  if (parsedReq > outstanding + 0.01) {
    return {
      ok: false,
      error: `Payment amount cannot exceed the remaining balance of ₦${outstanding.toLocaleString()}.`,
    };
  }

  return {
    ok: true,
    amount: Math.round(parsedReq * 100) / 100,
    outstanding,
  };
}

export function shouldMarkJobCompleted(params: {
  approvedQuoteTotal: number;
  verifiedPaidTotal: number;
}): boolean {
  const quoteTotal = Math.max(0, Number(params.approvedQuoteTotal) || 0);
  const paidTotal = Math.max(0, Number(params.verifiedPaidTotal) || 0);
  if (quoteTotal > 0) {
    return paidTotal + 0.01 >= quoteTotal;
  }
  return paidTotal > 0;
}
