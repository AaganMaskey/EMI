import ExcelJS from 'exceljs';

export interface ExcelRow { label: string; principal: number; interest: number; balance: number; total?: number }

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'result' in (v as any)) return num((v as any).result);
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.\-]/g, ''));
    return v.replace(/[^0-9.\-]/g, '') === '' ? null : n;
  }
  return null;
};

/**
 * Layout-tolerant reader: finds the header row that mentions Principal, Interest and Balance,
 * then reads every following row that has numbers in those columns.
 * Totals rows (label contains "total") are skipped.
 */
export async function readSchedule(path: string): Promise<{ rows: ExcelRow[]; sheet: string; headerRow: number }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= Math.min(ws.rowCount, 40); r++) {
      const cells = ws.getRow(r).values as unknown[];
      const text = cells.map(c => String(c ?? '').toLowerCase());
      const pCol = text.findIndex(t => t.includes('principal'));
      const iCol = text.findIndex(t => t.includes('interest'));
      const bCol = text.findIndex(t => t.includes('balance'));
      if (pCol > 0 && iCol > 0 && bCol > 0) {
        const tCol = text.findIndex(t => t.includes('total') && t.includes('payment'));
        const rows: ExcelRow[] = [];
        for (let k = r + 1; k <= ws.rowCount; k++) {
          const row = ws.getRow(k).values as unknown[];
          const label = String(row[1] ?? '').trim();
          if (/total/i.test(label)) continue;
          const p = num(row[pCol]); const i = num(row[iCol]); const b = num(row[bCol]);
          if (p === null || i === null || b === null) continue;
          rows.push({ label, principal: p, interest: i, balance: b, total: tCol > 0 ? num(row[tCol]) ?? undefined : undefined });
        }
        return { rows, sheet: ws.name, headerRow: r };
      }
    }
  }
  throw new Error('No sheet with Principal / Interest / Balance headers found in the downloaded workbook');
}
