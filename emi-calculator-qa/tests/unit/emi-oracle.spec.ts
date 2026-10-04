import { test, expect } from '@playwright/test';
import { calcEmi, calcTotals, buildYearlySchedule } from '../../src/emi';

/**
 * Self-test of the oracle against the figures printed in the assessment screenshot.
 * If these fail, every UI comparison would be meaningless, so this runs first and needs no network.
 */
test.describe('EMI oracle @unit @smoke', () => {
  const base = { principal: 5_000_000, annualRatePct: 9, tenureMonths: 240 };

  test('matches the screenshot headline figures (50L, 9%, 20y)', () => {
    const t = calcTotals(base);
    expect(Math.round(t.emi)).toBe(44_986);
    expect(Math.round(t.totalInterest)).toBe(5_796_711);
    expect(Math.round(t.totalPayment)).toBe(10_796_711);
  });

  test('matches the screenshot year-wise rows', () => {
    const rows = buildYearlySchedule(base, 2026, 11);
    expect(rows).toHaveLength(21); // 2026..2046
    expect(rows[0].payments).toBe(11);
    expect(rows[20].payments).toBe(1);
    expect([Math.round(rows[0].principal), Math.round(rows[0].interest), Math.round(rows[0].balance)])
      .toEqual([85_508, 409_341, 4_914_492]);
    expect([Math.round(rows[4].principal), Math.round(rows[4].interest), Math.round(rows[4].balance)])
      .toEqual([133_033, 406_803, 4_446_986]);
    expect([Math.round(rows[20].principal), Math.round(rows[20].interest), Math.round(rows[20].balance)])
      .toEqual([44_651, 335, 0]);
    expect(rows[20].loanPaidPct).toBeCloseTo(100, 6);
  });

  test('zero interest degenerates to principal / months', () => {
    expect(calcEmi({ principal: 1_200_000, annualRatePct: 0, tenureMonths: 120 })).toBe(10_000);
  });

  test('sum of schedule principal equals the loan amount', () => {
    const rows = buildYearlySchedule(base, 2026, 11);
    const sum = rows.reduce((a, r) => a + r.principal, 0);
    expect(sum).toBeCloseTo(base.principal, 4);
  });

  test('EMI is monotonic: higher rate / amount raises EMI, longer tenure lowers it', () => {
    const e = calcEmi(base);
    expect(calcEmi({ ...base, annualRatePct: 10 })).toBeGreaterThan(e);
    expect(calcEmi({ ...base, principal: 6_000_000 })).toBeGreaterThan(e);
    expect(calcEmi({ ...base, tenureMonths: 300 })).toBeLessThan(e);
  });
});
