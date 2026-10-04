import { test, expect } from '@playwright/test';
import { EmiCalculatorPage } from '../../src/pages/EmiCalculatorPage';
import { calcTotals, RUPEE_TOLERANCE } from '../../src/emi';

/**
 * TASK 3a + 3b: drive the three sliders, capture the EMI, and verify it with an independent
 * formula calculation. Sliders snap to their own step, so we read the *actual* input values back
 * after sliding and feed THOSE into the oracle (the requested value is only a target).
 */
test.describe('EMI calculation via sliders', () => {
  let app: EmiCalculatorPage;
  test.beforeEach(async ({ page }) => {
    app = new EmiCalculatorPage(page);
    await app.open();
  });

  test('default state shows the documented sample values @smoke @regression', async () => {
    const i = await app.readInputs();
    expect(i).toMatchObject({ principal: 5_000_000, annualRatePct: 9, tenureValue: 20 });
    const r = await app.readResults();
    expect(r.emi).toBe(44_986);
    expect(r.totalInterest).toBe(5_796_711);
    expect(r.totalPayment).toBe(10_796_711);
  });

  const scenarios = [
    { name: 'mid-range',          amount: 7_500_000,  rate: 8.5,  years: 15 },
    { name: 'high amount, long',  amount: 15_000_000, rate: 11,   years: 30 },
    { name: 'low amount, short',  amount: 1_000_000,  rate: 7,    years: 5 },
    { name: 'high rate',          amount: 5_000_000,  rate: 18,   years: 10 },
    { name: 'near upper bounds',  amount: 19_500_000, rate: 19.5, years: 29 },
    { name: 'near lower bounds',  amount: 500_000,    rate: 5.5,  years: 1 },
  ];

  for (const s of scenarios) {
    test(`slider scenario: ${s.name} -> EMI matches formula @regression`, async () => {
      await app.slideAmount(s.amount);
      await app.slideRate(s.rate);
      await app.slideTenureYears(s.years);
      await app.settle();

      const actual = await app.readInputs();               // what the slider really set
      const ui = await app.readResults();                  // what the app shows
      const exp = calcTotals({
        principal: actual.principal,
        annualRatePct: actual.annualRatePct,
        tenureMonths: Math.round(actual.tenureValue * 12),
      });

      // Sanity: slider landed near the requested target (snapping tolerance 5% of range)
      expect(Math.abs(actual.principal - s.amount)).toBeLessThanOrEqual(0.05 * 20_000_000);

      expect.soft(ui.emi, 'EMI').toBeCloseTo(exp.emi, 0);
      expect.soft(Math.abs(ui.emi - exp.emi)).toBeLessThanOrEqual(RUPEE_TOLERANCE);
      // total interest/payment are computed from the unrounded EMI by the app: allow n * 0.5 drift
      const drift = Math.ceil(actual.tenureValue * 12 * 0.5) + RUPEE_TOLERANCE;
      expect.soft(Math.abs(ui.totalInterest - exp.totalInterest), 'Total interest').toBeLessThanOrEqual(drift);
      expect.soft(Math.abs(ui.totalPayment - exp.totalPayment), 'Total payment').toBeLessThanOrEqual(drift);
      // Invariant independent of the formula: total payment = principal + interest
      expect(ui.totalPayment).toBeCloseTo(actual.principal + ui.totalInterest, -1);
    });
  }

  test('moving a slider updates the text box and the result together @smoke', async () => {
    const before = await app.readResults();
    await app.slideAmount(10_000_000);
    await app.settle();
    const after = await app.readResults();
    expect((await app.readInputs()).principal).toBeGreaterThan(5_000_000);
    expect(after.emi).toBeGreaterThan(before.emi);
  });

  test('keyboard accessibility: arrow keys change the slider value @regression', async () => {
    const start = (await app.readInputs()).annualRatePct;
    await app.nudge(app.sliders.rate, 'ArrowRight', 3);
    await app.settle();
    expect((await app.readInputs()).annualRatePct).toBeGreaterThan(start);
  });
});

test.describe('EMI calculation via typed inputs', () => {
  let app: EmiCalculatorPage;
  test.beforeEach(async ({ page }) => {
    app = new EmiCalculatorPage(page);
    await app.open();
  });

  const typed = [
    { amount: '2500000', rate: '6.75', years: '12' },
    { amount: '10000000', rate: '12.25', years: '25' },
    { amount: '3000000', rate: '5', years: '3' },
  ];
  for (const t of typed) {
    test(`typed ${t.amount} @ ${t.rate}% for ${t.years}y @regression`, async () => {
      await app.setAmount(t.amount); await app.setRate(t.rate); await app.setTenure(t.years);
      await app.settle();
      const ui = await app.readResults();
      const exp = calcTotals({ principal: +t.amount, annualRatePct: +t.rate, tenureMonths: +t.years * 12 });
      expect(Math.abs(ui.emi - exp.emi)).toBeLessThanOrEqual(RUPEE_TOLERANCE);
    });
  }

  test('tenure unit toggle: 240 months equals 20 years @regression', async () => {
    const yearsEmi = (await app.readResults()).emi;
    await app.setTenureUnit('Mo');
    await app.setTenure('240');
    await app.settle();
    expect((await app.readResults()).emi).toBe(yearsEmi);
  });

  test('months mode: 18 months @regression', async () => {
    await app.setTenureUnit('Mo');
    await app.setTenure('18');
    await app.settle();
    const { principal, annualRatePct } = await app.readInputs();
    const exp = calcTotals({ principal, annualRatePct, tenureMonths: 18 });
    expect(Math.abs((await app.readResults()).emi - exp.emi)).toBeLessThanOrEqual(RUPEE_TOLERANCE);
  });
});

test.describe('Input validation & boundaries @negative', () => {
  let app: EmiCalculatorPage;
  test.beforeEach(async ({ page }) => {
    app = new EmiCalculatorPage(page);
    await app.open();
  });

  // Behaviour is not specified by the product, so the invariant we assert is robustness:
  // the app must never display NaN / Infinity / undefined / negative money.
  const hostile = [
    { field: 'amount', value: 'abcd' },
    { field: 'amount', value: '-500000' },
    { field: 'amount', value: '0' },
    { field: 'amount', value: '999999999999' },
    { field: 'rate', value: '0' },
    { field: 'rate', value: '-3' },
    { field: 'rate', value: '99' },
    { field: 'rate', value: '9.999999' },
    { field: 'tenure', value: '0' },
    { field: 'tenure', value: '-5' },
    { field: 'tenure', value: '100' },
  ] as const;

  for (const h of hostile) {
    test(`${h.field} = "${h.value}" never yields NaN/Infinity/negative output`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      if (h.field === 'amount') await app.setAmount(h.value);
      if (h.field === 'rate') await app.setRate(h.value);
      if (h.field === 'tenure') await app.setTenure(h.value);
      await page.waitForTimeout(500);
      const shown = [await app.emi.innerText(), await app.totalInterest.innerText(), await app.totalPayment.innerText()].join(' ');
      expect(shown).not.toMatch(/NaN|Infinity|undefined|null|-\s*[0-9]/i);
      expect(errors, 'uncaught JS errors').toEqual([]);
    });
  }

  test('inputs are clamped/handled at slider limits (max amount 2,00,00,000) @regression', async () => {
    await app.setAmount('20000000');
    await app.settle();
    const exp = calcTotals({ principal: 20_000_000, annualRatePct: 9, tenureMonths: 240 });
    expect(Math.abs((await app.readResults()).emi - exp.emi)).toBeLessThanOrEqual(RUPEE_TOLERANCE);
  });
});
