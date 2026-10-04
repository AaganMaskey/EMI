import { test, expect } from '@playwright/test';
import { EmiCalculatorPage } from '../../src/pages/EmiCalculatorPage';
import { buildYearlySchedule, calcEmi, YEARLY_TOLERANCE, RUPEE_TOLERANCE } from '../../src/emi';

/**
 * TASK 3c: validate that the year-wise TABLE, the BAR/LINE CHART and the formula all agree.
 * Three-way reconciliation:  oracle  <->  table  <->  chart
 */
const cases = [
  { name: 'default 50L / 9% / 20y', amount: '5000000', rate: '9', years: '20' },
  { name: '75L / 8.5% / 15y',       amount: '7500000', rate: '8.5', years: '15' },
  { name: '20L / 10% / 5y',         amount: '2000000', rate: '10', years: '5' },
];

for (const c of cases) {
  test.describe(`Schedule & chart - ${c.name}`, () => {
    let app: EmiCalculatorPage;
    test.beforeEach(async ({ page }) => {
      app = new EmiCalculatorPage(page);
      await app.open();
      await app.setAmount(c.amount); await app.setRate(c.rate); await app.setTenure(c.years);
      await app.settle();
    });

    test('table rows match the formula-based amortisation year by year @smoke @regression', async () => {
      const input = { principal: +c.amount, annualRatePct: +c.rate, tenureMonths: +c.years * 12 };
      const table = await app.readYearTable();
      expect(table.length).toBeGreaterThan(0);

      // Derive the number of instalments in the first calendar year from the page itself.
      const emi = calcEmi(input);
      const firstYearPayments = Math.round(table[0].total / emi);
      expect(firstYearPayments, 'first-year instalments').toBeGreaterThanOrEqual(1);
      expect(firstYearPayments).toBeLessThanOrEqual(12);

      const exp = buildYearlySchedule(input, table[0].year, firstYearPayments);
      expect(table.map(r => r.year), 'year labels').toEqual(exp.map(r => r.year));

      for (let k = 0; k < exp.length; k++) {
        const t = table[k]; const e = exp[k];
        const tag = `year ${e.year}`;
        expect.soft(Math.abs(t.principal - e.principal), `${tag} principal`).toBeLessThanOrEqual(YEARLY_TOLERANCE);
        expect.soft(Math.abs(t.interest - e.interest), `${tag} interest`).toBeLessThanOrEqual(YEARLY_TOLERANCE);
        expect.soft(Math.abs(t.total - e.total), `${tag} total`).toBeLessThanOrEqual(YEARLY_TOLERANCE);
        expect.soft(Math.abs(t.balance - e.balance), `${tag} balance`).toBeLessThanOrEqual(YEARLY_TOLERANCE + k);
        expect.soft(Math.abs(t.paidPct - e.loanPaidPct), `${tag} loan paid %`).toBeLessThanOrEqual(0.01 + 0.005);
      }
    });

    test('table internal invariants @regression', async () => {
      const t = await app.readYearTable();
      let prevBal = Infinity;
      for (const r of t) {
        expect.soft(Math.abs(r.principal + r.interest - r.total), `${r.year} A+B=total`).toBeLessThanOrEqual(RUPEE_TOLERANCE + 1);
        expect.soft(r.balance, `${r.year} balance non-increasing`).toBeLessThanOrEqual(prevBal);
        prevBal = r.balance;
      }
      const sumP = t.reduce((a, r) => a + r.principal, 0);
      expect(Math.abs(sumP - +c.amount), 'sum of yearly principal = loan amount').toBeLessThanOrEqual(t.length * 1.5);
      const last = t[t.length - 1];
      expect(last.balance, 'final balance').toBe(0);
      expect(last.paidPct, 'final loan paid %').toBeCloseTo(100, 1);
      // interest share falls over time, principal share rises
      expect(t[0].interest).toBeGreaterThan(t[0].principal);
    });

    test('chart series equal table values year by year @regression', async () => {
      const chart = await app.readBarChart();
      test.skip(chart === null, 'Highcharts object not reachable on window - see README "Known limitations"');
      const table = await app.readYearTable();

      const principal = chart!.find(s => /principal/i.test(s.name))!;
      const interest = chart!.find(s => /interest/i.test(s.name))!;
      const balance = chart!.find(s => /balance/i.test(s.name))!;
      expect(principal.points.length, 'principal points = table rows').toBe(table.length);
      expect(interest.points.length).toBe(table.length);
      expect(balance.points.length).toBe(table.length);

      table.forEach((row, k) => {
        expect.soft(Math.abs(principal.points[k].y - row.principal), `chart principal ${row.year}`).toBeLessThanOrEqual(RUPEE_TOLERANCE);
        expect.soft(Math.abs(interest.points[k].y - row.interest), `chart interest ${row.year}`).toBeLessThanOrEqual(RUPEE_TOLERANCE);
        expect.soft(Math.abs(balance.points[k].y - row.balance), `chart balance ${row.year}`).toBeLessThanOrEqual(RUPEE_TOLERANCE);
      });
    });

    test('pie chart split equals interest / principal share @regression', async () => {
      const pie = await app.readPieChart();
      test.skip(pie === null, 'Pie chart object not reachable');
      const res = await app.readResults();
      const total = res.totalPayment;
      const principalSlice = pie!.find(p => /principal/i.test(p.name))!;
      const interestSlice = pie!.find(p => /interest/i.test(p.name))!;
      expect(principalSlice.pct).toBeCloseTo((+c.amount / total) * 100, 0);
      expect(interestSlice.pct).toBeCloseTo((res.totalInterest / total) * 100, 0);
      expect(principalSlice.pct + interestSlice.pct).toBeCloseTo(100, 1);
    });
  });
}

test('chart and table refresh when an input changes (no stale data) @regression', async ({ page }) => {
  const app = new EmiCalculatorPage(page);
  await app.open();
  const before = await app.readYearTable();
  await app.setRate('12');
  await app.settle();
  const after = await app.readYearTable();
  expect(after[0].interest).toBeGreaterThan(before[0].interest);
});
