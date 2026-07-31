import { describe, test, expect } from 'bun:test';
import {
  matchRateTone,
  overbillingTone,
  unsupportedChargesTone,
  invoiceVsPODiff,
  invoiceVsPOTone,
  totalIssuesTone,
} from '../kpi-utils';

describe('matchRateTone', () => {
  test('>= 95 is good', () => expect(matchRateTone(96)).toBe('good'));
  test('85-95 is warn', () => expect(matchRateTone(90)).toBe('warn'));
  test('< 85 is bad', () => expect(matchRateTone(70)).toBe('bad'));
});

describe('overbillingTone', () => {
  test('> 0 is bad', () => expect(overbillingTone(10)).toBe('bad'));
  test('0 is good', () => expect(overbillingTone(0)).toBe('good'));
});

describe('unsupportedChargesTone', () => {
  test('> 0 is bad', () => expect(unsupportedChargesTone(5)).toBe('bad'));
  test('0 is good', () => expect(unsupportedChargesTone(0)).toBe('good'));
});

describe('invoiceVsPODiff', () => {
  test('computes percentage difference', () => {
    expect(invoiceVsPODiff(110, 100)).toBeCloseTo(10);
  });
  test('negative when invoice below PO', () => {
    expect(invoiceVsPODiff(90, 100)).toBeCloseTo(-10);
  });
  test('null when PO is 0', () => {
    expect(invoiceVsPODiff(50, 0)).toBeNull();
  });
});

describe('invoiceVsPOTone', () => {
  test('within 5% is good', () => expect(invoiceVsPOTone(4)).toBe('good'));
  test('5-10% is warn', () => expect(invoiceVsPOTone(7)).toBe('warn'));
  test('> 10% is bad', () => expect(invoiceVsPOTone(12)).toBe('bad'));
  test('null is neutral', () => expect(invoiceVsPOTone(null)).toBe('neutral'));
});

describe('totalIssuesTone', () => {
  test('any critical is bad', () => expect(totalIssuesTone(1, 0)).toBe('bad'));
  test('only high is warn', () => expect(totalIssuesTone(0, 2)).toBe('warn'));
  test('none is good', () => expect(totalIssuesTone(0, 0)).toBe('good'));
});
