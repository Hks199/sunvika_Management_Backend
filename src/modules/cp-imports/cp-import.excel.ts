import ExcelJS from 'exceljs';
import { parseCallingWorkbook } from '../calling-lists/calling-list.excel.js';
import { AppError } from '../../utils/app-error.util.js';
export const CP_IMPORT_HEADERS=['CP code','First name','Middle name','Last name','Email','Mobile number','Address','State','District','City','Pincode','Branch','Reporting RM employee code'] as const;
export const CP_IMPORT_MAX_ROWS=500;
export async function cpImportTemplate(){
  const book=new ExcelJS.Workbook();book.creator='Sunvika Management';
  const sheet=book.addWorksheet('Channel partners',{views:[{state:'frozen',ySplit:1}]});
  sheet.columns=CP_IMPORT_HEADERS.map(header=>({header,width:header==='Address'?40:header==='Email'?32:24,style:{numFmt:'@'}}));
  sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17204F'}};sheet.getRow(1).height=26;
  const optional=['CP code','Middle name','City','Pincode','Branch'];
  CP_IMPORT_HEADERS.forEach((header,index)=>{sheet.getCell(1,index+1).note=optional.includes(header)?'Optional. '+(header==='CP code'?'Leave blank to generate a unique CP code.':''): 'Required. '+(['State','District'].includes(header)?'Enter the active location name exactly as configured.':'');});
  sheet.getCell('F1').note='Required. Enter as text including country code, e.g. +919876543210. Do not add spaces or punctuation.';
  sheet.getCell('L1').note='Optional active branch name or code belonging to this state/district.';
  sheet.getCell('M1').note='Enter the active reporting RM employee code for this candidate. Different rows can have different RMs. Required unless a default Reporting RM is selected in the app. RM users can only assign to themselves.';
  sheet.autoFilter='A1:M1';
  return {fileName:'Channel-partner-bulk-template.xlsx',base64:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')};
}
export async function parseCpImport(bytes:Buffer){
  if(!Buffer.isBuffer(bytes))throw new AppError('Upload an .xlsx Excel file',400);
  const parsed=await parseCallingWorkbook(bytes);
  if(parsed.rows.length>CP_IMPORT_MAX_ROWS)throw new AppError('Upload at most 500 channel partners per workbook',400);
  const norm=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
  const actual=parsed.headers.map(norm),expected=CP_IMPORT_HEADERS.map(norm);
  const supported=actual.length===expected.length||actual.length===expected.length-1&&!actual.includes(norm('Reporting RM employee code'));
  if(!supported||new Set(actual).size!==actual.length||actual.some(value=>!expected.includes(value))||expected.slice(0,-1).some(value=>!actual.includes(value)))throw new AppError('Use the downloaded Channel Partner template without adding or removing headers',400);
  return parsed.rows.map(row=>({rowNumber:row.rowNumber,fields:Object.fromEntries(CP_IMPORT_HEADERS.map(header=>[header,row.values[actual.indexOf(norm(header))] ?? '']))}));
}
