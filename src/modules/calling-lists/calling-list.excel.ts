import ExcelJS from 'exceljs';
import { AppError } from '../../utils/app-error.util.js';
export const EXCEL_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MAX_EXCEL_SIZE = 5 * 1024 * 1024;
export const MAX_ROWS = 10000;
// XLSX is a ZIP archive. Bound its declared expansion before handing it to ExcelJS.
export function checkCallingArchive(bytes: Buffer, maxExpanded = 30 * 1024 * 1024) {
  if (bytes.readUInt32LE(0) !== 0x04034b50) throw new AppError('Upload a valid .xlsx Excel workbook', 400);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0) throw new AppError('Invalid Excel archive', 400);
  const count = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16), expanded = 0, worksheetCount = 0;
  if (count > 500 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw new AppError('Workbook archive is too complex', 400);
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new AppError('Invalid Excel archive directory', 400);
    expanded += bytes.readUInt32LE(cursor + 24);
    if (expanded > maxExpanded) throw new AppError('Workbook expands beyond the supported size limit', 400);
    const length = bytes.readUInt16LE(cursor + 28);
    const name = bytes.toString('utf8', cursor + 46, cursor + 46 + length);
    if (/^xl\/worksheets\/[^/]+\.xml$/i.test(name)) worksheetCount++;
    if (/vbaProject|externalLinks/i.test(name)) throw new AppError('Macros and external workbook links are not supported', 400);
    cursor += 46 + length + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
  }
  return { worksheetCount };
}
export async function parseCallingWorkbook(bytes: Buffer) {
  if (bytes.length < 22 || bytes.length > MAX_EXCEL_SIZE) throw new AppError('Excel files must be between 22 bytes and 5 MB', 400);
  checkCallingArchive(bytes);
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer); }
  catch { throw new AppError('Unable to read this workbook. Save it as an unencrypted .xlsx file', 400); }
  if (workbook.worksheets.length !== 1) throw new AppError('Use a workbook with exactly one worksheet', 400);
  const sheet = workbook.worksheets[0]!;
  if (sheet.columnCount < 1 || sheet.columnCount > 50 || sheet.rowCount > MAX_ROWS + 1) throw new AppError('Use up to 50 columns and 10,000 candidate rows', 400);
  function text(cell: ExcelJS.Cell): string {
    // Render cached/formatted text only; never execute formulas or turn hyperlinks into HTML.
    const value = cell.text.trim();
    if (value.length > 2000) throw new AppError('A cell exceeds the 2,000 character limit', 400);
    return value;
  }
  const headers = Array.from({ length: sheet.columnCount }, (_, i) => text(sheet.getRow(1).getCell(i + 1)));
  if (headers.some(header => !header) || new Set(headers.map(header => header.toLowerCase())).size !== headers.length) throw new AppError('The first row must contain a unique, nonempty header for every column', 400);
  const rows: Array<{ rowNumber: number; values: string[] }> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = headers.map((_, i) => text(row.getCell(i + 1)));
    if (values.some(Boolean)) rows.push({ rowNumber, values });
  });
  if (!rows.length) throw new AppError('Add at least one candidate below the header row', 400);
  return { headers, rows };
}


export const CALLING_TEMPLATE_HEADERS = ['First name', 'Last name', 'Email', 'Mobile number', 'Address', 'City', 'Pincode', 'Notes'] as const;
export async function buildCallingListTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sunvika Management';
  const sheet = workbook.addWorksheet('CP candidates', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = CALLING_TEMPLATE_HEADERS.map(header => ({ header, width: header === 'Address' || header === 'Notes' ? 40 : header === 'Email' ? 32 : 22, style: { numFmt: '@' } }));
  const header = sheet.getRow(1);
  header.height = 26;
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17247A' } };
  header.alignment = { vertical: 'middle' };
  sheet.autoFilter = { from: 'A1', to: 'H1' };
  sheet.getCell('D1').note = 'Enter the mobile number as text, including country code if available.';
  sheet.getCell('E1').note = 'State and district can be selected when reviewing and creating the CP account.';
  sheet.getCell('H1').note = 'Optional calling notes. Keep headers in row 1 and enter one candidate per row below.';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
