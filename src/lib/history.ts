/**
 * Push a new browser history entry only when the relative URL actually changes.
 * Prevents duplicate history entries while letting browser Back step through
 * in-dashboard tabs and conversation views.
 */
export function pushUrlIfChanged(nextUrl: string): void {
  if (typeof window === "undefined") return;
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (current !== nextUrl) {
    window.history.pushState(null, "", nextUrl);
  }
}
