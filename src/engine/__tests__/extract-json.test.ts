import { describe, test, expect } from 'bun:test';
import { extractJSON, analyzeBracketBalance } from '../reconcile';

const valid = '{"a": 1}';

describe('extractJSON', () => {
  test('passes through plain JSON', () => {
    expect(extractJSON(valid)).toBe(valid);
  });

  test('strips markdown json code fence', () => {
    expect(extractJSON('```json\n{"a": 1}\n```')).toBe(valid);
  });

  test('strips plain code fence without language tag', () => {
    expect(extractJSON('```\n{"a": 1}\n```')).toBe(valid);
  });

  test('extracts JSON surrounded by prose', () => {
    const text = 'Here is the result:\n{"a": 1}\n\nHope this helps!';
    expect(extractJSON(text)).toBe(valid);
  });

  test('extracts nested JSON object boundaries', () => {
    const nested = 'prefix {"outer": {"inner": [1,2,3]}} suffix';
    expect(extractJSON(nested)).toBe('{"outer": {"inner": [1,2,3]}}');
  });

  test('returns trimmed text when no braces found', () => {
    expect(extractJSON('  no json here  ')).toBe('no json here');
  });

  test('handles reasoning text with JSON embedded at the end', () => {
    const reasoning = 'I analyzed the documents.\nThe final report is:\n```json\n{"a": 1}\n```\nDone.';
    expect(extractJSON(reasoning)).toBe(valid);
  });
});

describe('analyzeBracketBalance', () => {
  test('reports balanced for well-formed JSON', () => {
    const result = analyzeBracketBalance('{"a":[1,2]}');
    expect(result.bracesBalanced).toBe(true);
    expect(result.bracketsBalanced).toBe(true);
    expect(result.openBraces).toBe(1);
    expect(result.closeBraces).toBe(1);
    expect(result.openBrackets).toBe(1);
    expect(result.closeBrackets).toBe(1);
  });

  test('reports unbalanced for truncated JSON', () => {
    const result = analyzeBracketBalance('{"a":[{"b":1}');
    expect(result.openBraces).toBe(2);
    expect(result.closeBraces).toBe(1);
    expect(result.bracesBalanced).toBe(false);
    expect(result.openBrackets).toBe(1);
    expect(result.closeBrackets).toBe(0);
    expect(result.bracketsBalanced).toBe(false);
  });

  test('ignores brackets inside string values', () => {
    const result = analyzeBracketBalance('{"a":"} ] {"}');
    expect(result.openBraces).toBe(1);
    expect(result.closeBraces).toBe(1);
    expect(result.bracesBalanced).toBe(true);
    expect(result.openBrackets).toBe(0);
    expect(result.closeBrackets).toBe(0);
    expect(result.bracketsBalanced).toBe(true);
  });
});
