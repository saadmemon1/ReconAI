import { describe, test, expect } from 'bun:test';
import {
  matchRateTone,
  overbillingTone,
  unsupportedChargesTone,
  invoiceVsPODiff,
  invoiceVsPOTone,
  totalIssuesTone,
  recommendedPayable,
  overbilledPercent,
  sanitizeKPIs,
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

describe('recommendedPayable', () => {
  test('subtracts overbilling and unsupported charges', () => {
    expect(recommendedPayable(1000, 100, 50)).toBe(850);
  });
  test('never negative', () => {
    expect(recommendedPayable(100, 200, 50)).toBe(0);
  });
  test('equals billed when no deductions', () => {
    expect(recommendedPayable(1000, 0, 0)).toBe(1000);
  });
});

describe('overbilledPercent', () => {
  test('computes percentage of billed', () => {
    expect(overbilledPercent(100, 1000)).toBeCloseTo(10);
  });
  test('null when billed is 0', () => {
    expect(overbilledPercent(50, 0)).toBeNull();
  });
});

describe('sanitizeKPIs (F4: KPI integrity)', () => {
  test('coerces strings and fills missing with 0', () => {
    const out = sanitizeKPIs({ totalInvoice: '1000', totalPO: undefined });
    expect(out.totalInvoice).toBe(1000);
    expect(out.totalPO).toBe(0);
  });

  test('preserves negative numbers exactly (credit notes, discounts, refunds)', () => {
    const out = sanitizeKPIs({ totalInvoice: -500, overbillingAmount: -5000, matchRate: -20 });
    expect(out.totalInvoice).toBe(-500);
    expect(out.overbillingAmount).toBe(-5000);
    expect(out.matchRate).toBe(-20);
  });

  test('does not clamp oversized values (no tampering)', () => {
    const out = sanitizeKPIs({ totalInvoice: 1000, overbillingAmount: 5000, matchRate: 150 });
    expect(out.overbillingAmount).toBe(5000);
    expect(out.matchRate).toBe(150);
  });

  test('preserves fractional counts', () => {
    const out = sanitizeKPIs({ matchedLineItems: 3.7, evidenceGaps: '2.9' });
    expect(out.matchedLineItems).toBe(3.7);
    expect(out.evidenceGaps).toBe(2.9);
  });

  test('NaN/Infinity become 0 (only non-finite values)', () => {
    const out = sanitizeKPIs({ totalInvoice: Number.NaN, overbillingAmount: Number.POSITIVE_INFINITY });
    expect(out.totalInvoice).toBe(0);
    expect(out.overbillingAmount).toBe(0);
  });
});
