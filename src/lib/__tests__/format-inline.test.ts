import { describe, test, expect } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { renderInlineFormatting } from '../format-inline';

describe('renderInlineFormatting (summary **bold** rendering)', () => {
  test('converts **bold** spans to <strong>', () => {
    const html = renderToStaticMarkup(
      createElement('div', null, renderInlineFormatting('Recommended payable **PKR 7,200**. Read it.'))
    );
    expect(html).toBe('<div>Recommended payable <strong>PKR 7,200</strong>. Read it.</div>');
  });

  test('converts *italic* spans to <em>', () => {
    const html = renderToStaticMarkup(
      createElement('div', null, renderInlineFormatting('emphasised *word* here'))
    );
    expect(html).toBe('<div>emphasised <em>word</em> here</div>');
  });

  test('leaves plain text untouched', () => {
    const html = renderToStaticMarkup(
      createElement('div', null, renderInlineFormatting('No formatting here.'))
    );
    expect(html).toBe('<div>No formatting here.</div>');
  });

  test('escapes HTML in the text (no injection from LLM output)', () => {
    const html = renderToStaticMarkup(
      createElement('div', null, renderInlineFormatting('<script>alert(1)</script>'))
    );
    expect(html).toBe('<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>');
  });

  test('handles multiple bold spans and line breaks', () => {
    const html = renderToStaticMarkup(
      createElement('div', null, renderInlineFormatting('**A** and **B**\nnext line'))
    );
    expect(html).toBe('<div><strong>A</strong> and <strong>B</strong>\nnext line</div>');
  });

  test('ignores empty ** ** markers', () => {
    const html = renderToStaticMarkup(
      createElement('div', null, renderInlineFormatting('a **** b'))
    );
    expect(html).toBe('<div>a **** b</div>');
  });

  test('an unmatched asterisk stays literal', () => {
    const html = renderToStaticMarkup(
      createElement('div', null, renderInlineFormatting('5 * 3 = 15'))
    );
    expect(html).toBe('<div>5 * 3 = 15</div>');
  });
});
