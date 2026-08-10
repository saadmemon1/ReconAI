import { describe, test, expect } from 'bun:test';
import { groupItemsIntoLines, expandToLine, type TextItemWithBox, type Box } from '../pdf-lines';

const item = (str: string, x1: number, x2: number, y1: number, y2: number): TextItemWithBox => ({
  str,
  box: { x1, y1, x2, y2 },
});

describe('groupItemsIntoLines', () => {
  test('single item → one line with its box and text', () => {
    const lines = groupItemsIntoLines([item('Qty', 10, 30, 100, 112)]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('Qty');
    expect(lines[0].box).toEqual({ x1: 10, y1: 100, x2: 30, y2: 112 });
  });

  test('items on the same baseline merge into ONE line (table row)', () => {
    const lines = groupItemsIntoLines([
      item('Mugs with Logo', 10, 120, 100, 112),
      item('Qty 16', 140, 190, 100, 112),
      item('Unit Price(PKR) 500', 210, 340, 100, 112),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].box).toEqual({ x1: 10, y1: 100, x2: 340, y2: 112 });
    expect(lines[0].text).toBe('Mugs with Logo Qty 16 Unit Price(PKR) 500');
  });

  test('different baselines → separate lines', () => {
    const lines = groupItemsIntoLines([
      item('Item', 10, 40, 100, 112),
      item('Total', 10, 40, 130, 142),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe('Item');
    expect(lines[1].text).toBe('Total');
  });

  test('baselines within tolerance merge, beyond tolerance split', () => {
    const lines = groupItemsIntoLines([
      item('A', 0, 10, 100, 112),
      item('B', 20, 30, 102, 114), // center 108 vs 106 → 2pt apart → merge
      item('C', 40, 50, 120, 132), // center 126 → split
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe('A B');
    expect(lines[1].text).toBe('C');
  });

  test('zero-size items are skipped', () => {
    const lines = groupItemsIntoLines([
      item('', 0, 0, 0, 0),
      item('Real', 10, 40, 100, 112),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('Real');
  });

  test('line text follows x order, not input order', () => {
    const lines = groupItemsIntoLines([
      item('right', 100, 140, 100, 112),
      item('left', 10, 50, 100, 112),
    ]);
    expect(lines[0].text).toBe('left right');
  });
});

describe('expandToLine', () => {
  const row: TextItemWithBox[] = [
    item('Mugs with Logo', 10, 120, 100, 112),
    item('Qty 16', 140, 190, 100, 112),
  ];

  test('fragment center inside the line → full union box + joined text', () => {
    const lines = groupItemsIntoLines(row);
    const frag: Box = { x1: 140, y1: 100, x2: 190, y2: 112 }; // the Qty cell
    const expanded = expandToLine(lines, frag);
    expect(expanded).not.toBeNull();
    expect(expanded!.box).toEqual({ x1: 10, y1: 100, x2: 190, y2: 112 });
    expect(expanded!.text).toBe('Mugs with Logo Qty 16');
  });

  test('fragment straddling the line boundary still resolves (center-based)', () => {
    const lines = groupItemsIntoLines(row);
    // Wider than the line on both sides — center lands inside → resolves
    const frag: Box = { x1: 0, y1: 100, x2: 300, y2: 112 };
    const expanded = expandToLine(lines, frag);
    expect(expanded).not.toBeNull();
    expect(expanded!.box).toEqual({ x1: 10, y1: 100, x2: 190, y2: 112 });
  });

  test('fragment far from any line → null', () => {
    const lines = groupItemsIntoLines(row);
    const frag: Box = { x1: 400, y1: 400, x2: 440, y2: 412 };
    expect(expandToLine(lines, frag)).toBeNull();
  });

  test('no lines → null', () => {
    expect(expandToLine([], { x1: 0, y1: 0, x2: 10, y2: 10 })).toBeNull();
  });
});
