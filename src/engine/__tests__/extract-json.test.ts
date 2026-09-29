import { describe, test, expect } from 'bun:test';
import { extractJSON, analyzeBracketBalance, escapeRawControlChars } from '../reconcile';

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

describe('escapeRawControlChars', () => {
  test('escapes a literal raw newline inside a string value so JSON.parse succeeds', () => {
    // Simulates a model writing an actual \n byte in a multi-line "summary"
    // field instead of the JSON-escaped "\\n" sequence — valid to a human,
    // invalid per the JSON spec ("Bad control character in string literal").
    const raw = '{"summary":"line one\nline two"}';
    expect(() => JSON.parse(raw)).toThrow();

    const fixed = escapeRawControlChars(raw);
    const parsed = JSON.parse(fixed);
    expect(parsed.summary).toBe('line one\nline two');
  });

  test('escapes raw tabs and carriage returns inside strings', () => {
    const raw = '{"a":"tab\there","b":"cr\rhere"}';
    const parsed = JSON.parse(escapeRawControlChars(raw));
    expect(parsed.a).toBe('tab\there');
    expect(parsed.b).toBe('cr\rhere');
  });

  test('leaves well-formed JSON untouched', () => {
    const valid = '{"a": 1, "b": "no control chars here"}';
    expect(escapeRawControlChars(valid)).toBe(valid);
  });

  test('does not touch already-escaped sequences', () => {
    const alreadyEscaped = '{"a":"line one\\nline two"}';
    expect(escapeRawControlChars(alreadyEscaped)).toBe(alreadyEscaped);
    expect(JSON.parse(escapeRawControlChars(alreadyEscaped)).a).toBe('line one\nline two');
  });

  test('ignores whitespace formatting outside of strings (not inside a string value)', () => {
    const formatted = '{\n  "a": 1\n}';
    expect(JSON.parse(escapeRawControlChars(formatted))).toEqual({ a: 1 });
  });
});
