/**
 * Content validation utilities for regulation text.
 *
 * The MOJ portal is a Nuxt SPA. When the scraper captures its loading state
 * instead of waiting for the client-side render to complete, the extracted
 * text is something like ". البوابة القانونية Loading..." — the portal shell,
 * not actual regulation content.
 *
 * These helpers detect such placeholder content so it can be rejected at
 * ingestion time and skipped when serving to users.
 */

/**
 * Returns `true` when the text looks like a MOJ SPA loading placeholder,
 * WAF/CDN block page, or is otherwise too short/empty to be real content.
 */
export function isLoadingPlaceholder(text: string): boolean {
  const normalized = text
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (!normalized) return true;

  // Exact loading-shell patterns (with optional leading dots/punctuation)
  if (/^[\.\s]*البوابة القانونية\s*loading\.{0,3}\s*$/i.test(normalized))
    return true;
  if (/^[\.\s]*loading\.{0,3}\s*$/i.test(normalized)) return true;
  // Just the portal name with no real content
  if (/^[\.\s]*البوابة القانونية[\.\s]*$/i.test(normalized)) return true;

  // Short text containing known SPA/portal markers
  const hasPortalMarkers =
    /البوابة القانونية|legal portal|loading|nuxt-loading|__nuxt__/i.test(
      normalized
    );
  if (hasPortalMarkers && normalized.length < 350) return true;

  // WAF / access-denied patterns
  const blockedPatterns = [
    /request rejected/i,
    /requested url was rejected/i,
    /support id\s*:\s*\d{8,}/i,
    /please consult with your administrator/i,
    /\[go back\]/i,
    /access denied/i,
    /forbidden/i,
    /تم رفض الطلب/i,
    /تم حظر/i,
  ];
  if (blockedPatterns.some((p) => p.test(normalized))) return true;

  return false;
}
