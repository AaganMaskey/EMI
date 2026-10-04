import { Page, Locator, Download, expect } from '@playwright/test';
import { parseMoney } from '../emi';

/**
 * Page Object for https://emicalculator.net/ (Home Loan tab).
 *
 * ALL selectors live in the SEL block below. The site is a third-party app, so if the DOM
 * changes only this block needs to be touched. Verify them once with `npm run codegen`
 * (or the Playwright Inspector) before the first run.
 */
const SEL = {
  amountInput: '#loanamount',
  amountSlider: '#loanamountslider',
  rateInput: '#loaninterest',
  rateSlider: '#loaninterestslider',
  tenureInput: '#loanterm',
  tenureSlider: '#loantermslider',
  handle: '.ui-slider-handle',
  emi: '#emiamount',
  totalInterest: '#emitotalinterest',
  totalPayment: '#emitotalamount',
  scheduleTable: '#emipaymenttable',
  scheduleYearRows: '#emipaymenttable tbody tr',
} as const;

export interface SliderBounds { min: number; max: number }
/** Slider scales printed on the page (from the assessment screenshot). */
export const BOUNDS = {
  amount: { min: 0, max: 20_000_000 } as SliderBounds, // 0 .. 200L
  rate: { min: 5, max: 20 } as SliderBounds,
  tenureYears: { min: 0, max: 30 } as SliderBounds,
};

export interface UiYearRow {
  year: number;
  principal: number;
  interest: number;
  total: number;
  balance: number;
  paidPct: number;
}

export interface ChartSeries { name: string; type: string; points: { x: number | string; y: number }[] }

export class EmiCalculatorPage {
  readonly amount: Locator;
  readonly rate: Locator;
  readonly tenure: Locator;
  readonly emi: Locator;
  readonly totalInterest: Locator;
  readonly totalPayment: Locator;
  readonly table: Locator;

  constructor(readonly page: Page) {
    this.amount = page.locator(SEL.amountInput);
    this.rate = page.locator(SEL.rateInput);
    this.tenure = page.locator(SEL.tenureInput);
    this.emi = page.locator(SEL.emi);
    this.totalInterest = page.locator(SEL.totalInterest);
    this.totalPayment = page.locator(SEL.totalPayment);
    this.table = page.locator(SEL.scheduleTable);
  }

  async open() {
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(this.amount).toBeVisible();
    await expect(this.emi).toContainText(/\d/);
  }

  // ---------- reading ----------
  async readInputs() {
    return {
      principal: parseMoney(await this.amount.inputValue()),
      annualRatePct: parseMoney(await this.rate.inputValue()),
      tenureValue: parseMoney(await this.tenure.inputValue()),
    };
  }
  async readResults() {
    return {
      emi: parseMoney(await this.emi.innerText()),
      totalInterest: parseMoney(await this.totalInterest.innerText()),
      totalPayment: parseMoney(await this.totalPayment.innerText()),
    };
  }

  // ---------- typing ----------
  private async type(input: Locator, value: string | number) {
    await input.click();
    await input.fill(String(value));
    await input.press('Tab'); // the app recalculates on change/blur
  }
  setAmount(v: string | number) { return this.type(this.amount, v); }
  setRate(v: string | number) { return this.type(this.rate, v); }
  setTenure(v: string | number) { return this.type(this.tenure, v); }

  /** Switch the tenure unit toggle between years ("Yr") and months ("Mo"). */
  async setTenureUnit(unit: 'Yr' | 'Mo') {
    await this.page.locator('#loanterm').locator('xpath=ancestor::div[1]')
      .getByText(unit, { exact: true }).first().click();
  }

  // ---------- sliders ----------
  /**
   * Drags a jQuery-UI slider handle to the pixel position that corresponds to `target`.
   * Sliders snap to their own step, so callers must read the input back afterwards and use the
   * *actual* value for the oracle - never the requested one.
   */
  async dragSlider(sliderSelector: string, bounds: SliderBounds, target: number) {
    const slider = this.page.locator(sliderSelector);
    const handle = slider.locator(SEL.handle);
    await slider.scrollIntoViewIfNeeded();
    const box = await slider.boundingBox();
    if (!box) throw new Error(`Slider ${sliderSelector} has no bounding box`);
    const hb = await handle.boundingBox();
    if (!hb) throw new Error('Slider handle not found');
    const ratio = (target - bounds.min) / (bounds.max - bounds.min);
    const startX = hb.x + hb.width / 2;
    const startY = hb.y + hb.height / 2;
    const endX = box.x + box.width * Math.min(Math.max(ratio, 0), 1);
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move((startX + endX) / 2, startY, { steps: 5 });
    await this.page.mouse.move(endX, startY, { steps: 10 });
    await this.page.mouse.up();
  }
  slideAmount(v: number) { return this.dragSlider(SEL.amountSlider, BOUNDS.amount, v); }
  slideRate(v: number) { return this.dragSlider(SEL.rateSlider, BOUNDS.rate, v); }
  slideTenureYears(v: number) { return this.dragSlider(SEL.tenureSlider, BOUNDS.tenureYears, v); }

  /** Keyboard nudge (accessibility path): focus a handle and press an arrow key n times. */
  async nudge(sliderSelector: string, key: 'ArrowRight' | 'ArrowLeft' | 'Home' | 'End', times = 1) {
    const handle = this.page.locator(sliderSelector).locator(SEL.handle);
    await handle.focus();
    for (let i = 0; i < times; i++) await handle.press(key);
  }
  get sliders() { return { amount: SEL.amountSlider, rate: SEL.rateSlider, tenure: SEL.tenureSlider }; }

  /** Waits until the EMI text stops changing (the app animates/recalculates asynchronously). */
  async settle() {
    let prev = '';
    await expect.poll(async () => {
      const cur = await this.emi.innerText();
      const stable = cur === prev;
      prev = cur;
      return stable;
    }, { intervals: [150, 150, 150, 250], timeout: 8_000 }).toBe(true);
  }

  // ---------- schedule table ----------
  /** Reads the year-wise rows (ignores the expandable month-detail child rows). */
  async readYearTable(): Promise<UiYearRow[]> {
    await expect(this.table).toBeVisible();
    const raw: string[][] = await this.page.locator(SEL.scheduleYearRows).evaluateAll(trs =>
      trs.map(tr => Array.from(tr.querySelectorAll('td,th')).map(c => (c as HTMLElement).innerText.trim())));
    const rows: UiYearRow[] = [];
    for (const cells of raw) {
      const m = cells[0]?.match(/(20\d{2}|19\d{2})/);
      if (!m || cells.length < 6 || !/\d/.test(cells[1])) continue;
      rows.push({
        year: Number(m[1]),
        principal: parseMoney(cells[1]),
        interest: parseMoney(cells[2]),
        total: parseMoney(cells[3]),
        balance: parseMoney(cells[4]),
        paidPct: parseMoney(cells[5]),
      });
    }
    return rows;
  }

  // ---------- chart ----------
  /** Reads the Highcharts series straight from the chart object (more reliable than pixel/tooltip scraping). */
  async readBarChart(): Promise<ChartSeries[] | null> {
    return this.page.evaluate(() => {
      const H = (window as any).Highcharts;
      if (!H || !H.charts) return null;
      const chart = H.charts.filter(Boolean).find((c: any) =>
        c.series?.some((s: any) => /principal/i.test(s.name)) && c.series?.some((s: any) => /balance/i.test(s.name)));
      if (!chart) return null;
      return chart.series.map((s: any) => ({
        name: String(s.name), type: String(s.type),
        points: s.data.map((p: any) => ({ x: p.category ?? p.x, y: Number(p.y) })),
      }));
    });
  }
  async readPieChart(): Promise<{ name: string; y: number; pct: number }[] | null> {
    return this.page.evaluate(() => {
      const H = (window as any).Highcharts;
      if (!H || !H.charts) return null;
      const chart = H.charts.filter(Boolean).find((c: any) => c.series?.some((s: any) => s.type === 'pie'));
      if (!chart) return null;
      return chart.series[0].data.map((p: any) => ({ name: String(p.name), y: Number(p.y), pct: Number(p.percentage) }));
    });
  }

  // ---------- download ----------
  async downloadExcel(): Promise<Download> {
    const link = this.page.getByRole('link', { name: /excel/i }).or(this.page.getByText(/download.*excel|excel/i)).first();
    await link.scrollIntoViewIfNeeded();
    const [download] = await Promise.all([this.page.waitForEvent('download'), link.click()]);
    return download;
  }
}
