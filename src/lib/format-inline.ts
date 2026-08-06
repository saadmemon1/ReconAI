import { createElement, type ReactNode } from 'react';

/**
 * Render inline **bold** (and *italic*) markers in LLM-generated text as
 * <strong>/<em> elements. Everything else stays escaped plain text — React
 * escapes by default and we never use dangerouslySetInnerHTML, so LLM output
 * cannot inject markup (the summary is untrusted data, same as documents).
 */
export function renderInlineFormatting(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).flatMap((part, i) => {
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
