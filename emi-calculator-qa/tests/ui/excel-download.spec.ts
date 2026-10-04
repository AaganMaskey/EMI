import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { EmiCalculatorPage } from '../../src/pages/EmiCalculatorPage';
import { readSchedule } from '../../src/utils/excel';
import { calcTotals, RUPEE_TOLERANCE } from '../../src/emi';

/**
 * TASK 3d: download the Excel file and add checks.
 * The checks adapt to whether the workbook holds a monthly schedule (n rows) or a yearly one.
 */
test('downloaded Excel is consistent with the on-screen results @regression', async ({ page }, testInfo) => {
  const app = new EmiCalculatorPage(page);
  await app.open();
  await app.setAmount('5000000'); await app.setRate('9'); await app.setTenure('20');
  await app.settle();

  const ui = await app.readResults();
  const table = await app.readYearTable();
  const exp = calcTotals({ principal: 5_000_000, annualRatePct: 9, tenureMonths: 240 });

  // 1. file is delivered and is a real .xlsx
  const download = await app.downloadExcel();
  const dir = path.join(testInfo.outputDir, 'downloads');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, download.suggestedFilename());
  await download.saveAs(file);
  expect(download.suggestedFilename()).toMatch(/\.xlsx?$/i);
  expect(fs.statSync(file).size, 'file is not empty').toBeGreaterThan(2_000);
  expect(fs.readFileSync(file).subarray(0, 2).toString(), 'xlsx is a zip container (PK)').toBe('PK');

  // 2. parse and check content
  const { rows } = await readSchedule(file);
  expect(rows.length, 'schedule rows exist').toBeGreaterThan(0);

  const sumP = rows.reduce((a, r) => a + r.principal, 0);
  const sumI = rows.reduce((a, r) => a + r.interest, 0);
  const tol = Math.max(rows.length, 5);
  expect.soft(Math.abs(sumP - 5_000_000), 'sum(principal) = loan amount').toBeLessThanOrEqual(tol);
  expect.soft(Math.abs(sumI - ui.totalInterest), 'sum(interest) = UI total interest').toBeLessThanOrEqual(tol);
  expect.soft(Math.abs(sumI - exp.totalInterest), 'sum(interest) = formula total interest').toBeLessThanOrEqual(tol);
  expect.soft(rows[rows.length - 1].balance, 'closing balance').toBeLessThanOrEqual(RUPEE_TOLERANCE);

  // balance never increases
  for (let k = 1; k < rows.length; k++) {
    expect.soft(rows[k].balance, `balance non-increasing at row ${k}`).toBeLessThanOrEqual(rows[k - 1].balance + 0.5);
  }

  // 3. layout-specific checks
  if (rows.length === 240) {
    // monthly schedule: each month principal + interest = EMI, interest strictly decreasing
    rows.forEach((r, k) => {
      expect.soft(Math.abs(r.principal + r.interest - exp.emi), `month ${k + 1} P+I = EMI`).toBeLessThanOrEqual(RUPEE_TOLERANCE + 1);
    });
    expect.soft(rows[0].interest).toBeCloseTo(5_000_000 * 0.09 / 12, 0); // first-month interest
  } else if (rows.length === table.length) {
    // yearly schedule: must equal the on-screen table row by row
    table.forEach((t, k) => {
      expect.soft(Math.abs(rows[k].principal - t.principal), `excel vs UI principal ${t.year}`).toBeLessThanOrEqual(1);
      expect.soft(Math.abs(rows[k].interest - t.interest), `excel vs UI interest ${t.year}`).toBeLessThanOrEqual(1);
      expect.soft(Math.abs(rows[k].balance - t.balance), `excel vs UI balance ${t.year}`).toBeLessThanOrEqual(1);
    });
  } else {
    testInfo.annotations.push({ type: 'note', description: `Workbook has ${rows.length} data rows (neither 240 monthly nor ${table.length} yearly); only aggregate checks ran.` });
  }
});
