import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { AppError } from '../../utils/app-error.util.js';
import { checkCallingArchive } from './calling-list.excel.js';
export const MAX_BULK_SIZE = 100 * 1024 * 1024;
export const MAX_BULK_ROWS = 1_000_000;
export const SHEET_ENTRIES = 50;
export async function buildCallingSheet(headers: string[], rows: string[][]) {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('CP candidates');
  sheet.addRow(headers); sheet.getRow(1).font = { bold: true };
  for (const values of rows) sheet.addRow(values); // Strings remain text; spreadsheet formulas are never generated.
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
/** Hold one 50-entry sheet at a time, rather than loading all worksheet rows. */
export async function splitCallingWorkbook(bytes: Buffer, save: (headers: string[], rows: string[][], part: number, count: number) => Promise<void>) {
  if (bytes.length < 22 || bytes.length > MAX_BULK_SIZE) throw new AppError('Choose an .xlsx workbook up to 100 MB', 400);
  if (checkCallingArchive(bytes, 768 * 1024 * 1024).worksheetCount !== 1) throw new AppError('Use exactly one worksheet', 400);
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(bytes), { worksheets: 'emit', sharedStrings: 'cache', styles: 'cache', hyperlinks: 'ignore', entries: 'ignore' });
  // ExcelJS may encounter a worksheet before workbook.xml in a valid ZIP archive.
  Object.assign(reader, { model: { sheets: [] } });
  let sheetCount = 0, count = 0, part = 0, headers: string[] = [], rows: string[][] = [];
  function text(cell: ExcelJS.Cell) { const value = cell.text.trim(); if (value.length > 2000) throw new AppError('A cell exceeds 2,000 characters', 400); return value; }
  for await (const sheet of reader) {
    if (++sheetCount !== 1) throw new AppError('Use exactly one worksheet', 400);
    for await (const row of sheet) {
      if (row.number === 1) {
        if (row.cellCount < 1 || row.cellCount > 50) throw new AppError('Use between 1 and 50 columns', 400);
        headers = Array.from({ length: row.cellCount }, (_, i) => text(row.getCell(i + 1)));
        if (headers.some(h => !h) || new Set(headers.map(h => h.toLowerCase())).size !== headers.length) throw new AppError('The first row must contain unique, nonempty column headers', 400);
        continue;
      }
      if (!headers.length) throw new AppError('Put the column headers in row 1', 400);
      if (row.number > 1_048_576 || row.cellCount > headers.length) throw new AppError('Candidate columns must match the header row', 400);
      const values = headers.map((_, i) => text(row.getCell(i + 1)));
      if (!values.some(Boolean)) continue;
      if (++count > MAX_BULK_ROWS) throw new AppError('Use up to 1,000,000 candidates per upload', 400);
      rows.push(values);
      if (rows.length === SHEET_ENTRIES) { await save(headers, rows, ++part, count); rows = []; }
    }
  }
  if (!count || sheetCount !== 1) throw new AppError('Add at least one candidate in a single worksheet', 400);
  if (rows.length) await save(headers, rows, ++part, count);
  return { candidateCount: count, sheetCount: part };
}
