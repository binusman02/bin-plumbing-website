export interface QuotationLineItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

const ITEMS_MARKER_START = "\n<!--BP_QUOTE_ITEMS:";
const ITEMS_MARKER_END = "-->";

export function encodeQuotationNotes(
  notes?: string,
  items?: QuotationLineItem[]
): string | null {
  const cleanNotes = (notes || "").trim();
  const validItems = (items || []).filter(
    (item) => item.name.trim().length > 0 && (Number(item.unitPrice) || 0) >= 0
  );
  if (validItems.length === 0) {
    return cleanNotes || null;
  }
  const serialized = JSON.stringify(
    validItems.map((it) => ({
      id: it.id,
      name: it.name.trim(),
      quantity: Math.max(1, Number(it.quantity) || 1),
      unitPrice: Math.max(0, Number(it.unitPrice) || 0),
    }))
  );
  return `${cleanNotes}${ITEMS_MARKER_START}${serialized}${ITEMS_MARKER_END}`;
}

export function decodeQuotationNotes(raw?: string | null): {
  notes: string;
  items: QuotationLineItem[];
} {
  if (!raw) return { notes: "", items: [] };
  const startIdx = raw.indexOf(ITEMS_MARKER_START);
  if (startIdx === -1) {
    return { notes: raw, items: [] };
  }
  const endIdx = raw.indexOf(ITEMS_MARKER_END, startIdx + ITEMS_MARKER_START.length);
  if (endIdx === -1) {
    return { notes: raw, items: [] };
  }
  const cleanNotes = raw.slice(0, startIdx).trim();
  const jsonPart = raw.slice(startIdx + ITEMS_MARKER_START.length, endIdx);
  try {
    const parsed = JSON.parse(jsonPart);
    if (Array.isArray(parsed)) {
      const items: QuotationLineItem[] = parsed
        .filter((x) => x && typeof x.name === "string")
        .map((x, idx) => ({
          id: typeof x.id === "string" ? x.id : `item-${idx}`,
          name: String(x.name),
          quantity: Math.max(1, Number(x.quantity) || 1),
          unitPrice: Math.max(0, Number(x.unitPrice) || 0),
        }));
      return { notes: cleanNotes, items };
    }
  } catch {
    // Ignore malformed JSON marker
  }
  return { notes: cleanNotes, items: [] };
}
