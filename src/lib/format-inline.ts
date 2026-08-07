import { createElement, type ReactNode } from 'react';

/**
 * Color tokens usable inside **bold** spans: **[danger]…** / **[success]…** /
 * **[secondary]…** map to the app's semantic text colors. Used by the
 * engine-authored payable derivation (billed = plain, overbilled = red,
 * payable = green). Everything else stays escaped plain text — React escapes
 * by default and we never use dangerouslySetInnerHTML, so LLM output cannot
 * inject markup (the summary is untrusted data, same as documents).
 */
const COLOR_CLASS: Record<string, string> = {
  danger: 'text-destructive',
  success: 'text-success',
  secondary: 'text-secondary',
};

const COLORED_BOLD_RE = /\*\*\[(danger|success|secondary)\]([^*]+)\*\*/;

export function renderInlineFormatting(text: string): ReactNode[] {
  return text.split(/(\*\*\[[a-z]+\][^*]+\*\*|\*\*[^*]+\*\*)/g).flatMap((part, i) => {
    const colored = part.match(COLORED_BOLD_RE);
    if (colored) {
      return createElement('strong', { key: `b${i}`, className: COLOR_CLASS[colored[1]] }, colored[2]);
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return createElement('strong', { key: `b${i}` }, part.slice(2, -2));
    }
    // Italics: supported render-side only (the prompt instructs bold-only,
    // but if the LLM sneaks in *...* it renders instead of showing asterisks).
    return part.split(/(\*[^*]+\*)/g).map((p, j) => {
      if (p.startsWith('*') && p.endsWith('*') && p.length > 2) {
        return createElement('em', { key: `i${i}-${j}` }, p.slice(1, -1));
      }
      return p;
    });
  });
}
