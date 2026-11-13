import assert from 'node:assert/strict';
import test from 'node:test';
import { Writable } from 'node:stream';
import ExcelJS from 'exceljs';
import { splitCallingWorkbook } from '../dist/modules/calling-lists/calling-bulk.excel.js';
test('one lakh and one candidates stream into 2,001 sheets with no missing or duplicated entries', async () => {
  const chunks=[];
  const stream=new Writable({write(chunk,_encoding,done){chunks.push(Buffer.from(chunk));done();}});
  const workbook=new ExcelJS.stream.xlsx.WorkbookWriter({stream,useSharedStrings:true});
  const sheet=workbook.addWorksheet('Candidates'); sheet.addRow(['Name','Mobile']).commit();
  for(let i=0;i<100001;i++)sheet.addRow([`Candidate ${i}`,'0123456789']).commit();
  sheet.commit(); await workbook.commit();
  let count=0,parts=0;
  const result=await splitCallingWorkbook(Buffer.concat(chunks),async(headers,rows,part,processed)=>{
    assert.deepEqual(headers,['Name','Mobile']);assert.ok(rows.length>=1&&rows.length<=50);
    for(const values of rows){assert.equal(values[0],`Candidate ${count++}`);assert.equal(values[1],'0123456789');}
    assert.equal(processed,count);assert.equal(part,++parts);
  });
  assert.deepEqual(result,{candidateCount:100001,sheetCount:2001});assert.equal(count,100001);
});
