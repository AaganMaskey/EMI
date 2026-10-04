/**
 * Independent EMI "oracle" used by the tests.
 * Written from the textbook formula and shares no code with the app, so a defect in the
 * app's logic cannot also hide in the expected value.
 *
 *   EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
 *   P = principal, r = annual rate / 12 / 100 (monthly rate), n = tenure in months
 *   Special case: r = 0  ->  EMI = P / n
 */
export interface LoanInput {
  principal: number;
  annualRatePct: number;
  tenureMonths: number;
}

export interface YearRow {
  year: number;
  /** Number of instalments that fall in this calendar year */
  payments: number;
  principal: number;
  interest: number;
  total: number;
  /** Outstanding principal at the end of the year */
  balance: number;
  /** Cumulative principal repaid, as % of the loan */
  loanPaidPct: number;
}

export function monthlyRate(annualRatePct: number): number {
  return annualRatePct / 12 / 100;
}

export function calcEmi({ principal, annualRatePct, tenureMonths }: LoanInput): number {
  if (tenureMonths <= 0) throw new Error('tenureMonths must be > 0');
  const r = monthlyRate(annualRatePct);
  if (r === 0) return principal / tenureMonths;
  const f = Math.pow(1 + r, tenureMonths);
  return (principal * r * f) / (f - 1);
}

export function calcTotals(input: LoanInput) {
  const emi = calcEmi(input);
  const totalPayment = emi * input.tenureMonths;
  return { emi, totalPayment, totalInterest: totalPayment - input.principal };
}

/**
 * Year-wise amortisation table.
 * @param firstYearPayments instalments that fall in the first calendar year. The site's schedule
 *   starts mid-year (the sample shows 11 payments in 2026 and 1 in 2046). The UI tests derive this
 *   value from the page (first-row total / EMI) so the oracle never has to guess the start-month rule.
 */
export function buildYearlySchedule(input: LoanInput, startYear: number, firstYearPayments: number): YearRow[] {
  const r = monthlyRate(input.annualRatePct);
  const emi = calcEmi(input);
  const rows: YearRow[] = [];
  let balance = input.principal;
  let remaining = input.tenureMonths;
  let year = startYear;
  let slot = Math.min(firstYearPayments, remaining);

  while (remaining > 0) {
    let p = 0;
    let i = 0;
    for (let k = 0; k < slot; k++) {
      const interest = balance * r;
      const princ = emi - interest;
      balance -= princ;
      p += princ;
      i += interest;
    }
    remaining -= slot;
    const bal = Math.abs(balance) < 0.5 ? 0 : balance;
    rows.push({
      year,
      payments: slot,
      principal: p,
      interest: i,
      total: p + i,
      balance: bal,
      loanPaidPct: ((input.principal - bal) / input.principal) * 100,
    });
    year += 1;
    slot = Math.min(12, remaining);
  }
  return rows;
}

/** Parses "₹ 1,07,96,711" / "44,986" / "9.5%" into a number. */
export function parseMoney(text: string): number {
  const cleaned = text.replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') throw new Error(`Cannot parse a number from "${text}"`);
  return Number(cleaned);
}

/** The site rounds each displayed figure to a whole rupee. */
export const RUPEE_TOLERANCE = 1;
/** Year totals accumulate up to ~12 individual roundings. */
export const YEARLY_TOLERANCE = 12;
