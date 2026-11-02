import PDFDocument from 'pdfkit';

export interface QuotationPdfData {
  companyName: string; companyDetails: string; customerName: string; customerMobile: string; siteAddress: string;
  requiredCapacityKW: number; ratePerKW: number; totalProjectAmount: number; paymentMode: string;
  panelBrand: string; panelTechnology: string; quotationDate: Date; quotationNumber: string; version: number; termsAndConditions: string; authorizedSignatory: string;
}

function pdfBuffer(document: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
    document.once('error', reject);
    document.once('end', () => resolve(Buffer.concat(chunks)));
    document.end();
  });
}

function money(value: number): string { return `INR ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)}`; }
function heading(doc: PDFKit.PDFDocument, title: string): void {
  doc.moveDown(0.9).font('Helvetica-Bold').fontSize(12).fillColor('#14532d').text(title.toUpperCase());
  doc.moveDown(0.25).strokeColor('#86a98e').lineWidth(1).moveTo(52, doc.y).lineTo(543, doc.y).stroke().moveDown(0.5).fillColor('#17221b');
}
function row(doc: PDFKit.PDFDocument, label: string, value: string): void {
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#526157').text(label, 54, y, { width: 160 });
  doc.font('Helvetica').fontSize(10).fillColor('#17221b').text(value, 215, y, { width: 325 });
  doc.moveDown(0.5);
}

export async function generateQuotationPdf(data: QuotationPdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 48, right: 52, bottom: 52, left: 52 }, info: { Title: `Quotation ${data.quotationNumber}`, Author: data.companyName, Subject: 'Solar project quotation' } });
  doc.rect(0, 0, 595, 118).fill('#14532d');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text(data.companyName, 52, 43);
  doc.font('Helvetica').fontSize(9).text(data.companyDetails || 'Solar project solutions', 54, 77, { width: 480 });
  doc.fillColor('#17221b').font('Helvetica-Bold').fontSize(18).text('PROJECT QUOTATION', 52, 141);
  doc.font('Helvetica').fontSize(10).fillColor('#526157').text(`${data.quotationNumber}  •  Version ${data.version}  •  ${data.quotationDate.toLocaleDateString('en-IN')}`, 54, 169);

  heading(doc, 'Customer and site');
  row(doc, 'Customer', data.customerName);
  row(doc, 'Mobile', data.customerMobile);
  row(doc, 'Installation site', data.siteAddress);

  heading(doc, 'Solar project');
  row(doc, 'Required capacity', `${data.requiredCapacityKW.toLocaleString('en-IN')} kW`);
  row(doc, 'Rate per kW', money(data.ratePerKW));
  row(doc, 'Payment mode', data.paymentMode);
  row(doc, 'Panel brand', data.panelBrand);
  row(doc, 'Panel technology', data.panelTechnology);

  doc.moveDown(0.5);
  const totalY = doc.y;
  doc.roundedRect(52, totalY, 491, 52, 7).fill('#edf5ee');
  doc.fillColor('#526157').font('Helvetica-Bold').fontSize(10).text('TOTAL PROJECT AMOUNT', 68, totalY + 19);
  doc.fillColor('#14532d').font('Helvetica-Bold').fontSize(17).text(money(data.totalProjectAmount), 330, totalY + 16, { width: 195, align: 'right' });
  doc.y = totalY + 58;

  heading(doc, 'Terms and conditions');
  doc.font('Helvetica').fontSize(9).fillColor('#17221b').text(data.termsAndConditions, { width: 490, lineGap: 3 });
  doc.moveDown(2);
  doc.font('Helvetica-Bold').fontSize(10).text(data.companyName);
  doc.moveDown(1.8).font('Helvetica').fontSize(10).text(data.authorizedSignatory);
  doc.font('Helvetica-Bold').text(data.companyName);
  doc.font('Helvetica').fontSize(8).fillColor('#647067').text('This quotation is a project offer and is not a tax invoice.');
  return pdfBuffer(doc);
}

export async function generateBrochurePdf(): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 52, right: 56, bottom: 52, left: 56 }, info: { Title: 'Sunvika Private Limited Solar Brochure', Author: 'Sunvika Private Limited' } });
  doc.rect(0, 0, 595, 842).fill('#f5f8f4');
  doc.rect(0, 0, 595, 270).fill('#14532d');
  doc.fillColor('#bce7c5').font('Helvetica-Bold').fontSize(11).text('SUNVIKA PRIVATE LIMITED', 58, 58, { characterSpacing: 1.5 });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(30).text('A brighter way\nto power your home', 58, 99, { width: 460, lineGap: 5 });
  doc.fillColor('#e2f1e5').font('Helvetica').fontSize(12).text('Solar solutions planned around your site and energy needs.', 60, 194, { width: 420 });
  doc.fillColor('#17221b').font('Helvetica-Bold').fontSize(17).text('From first assessment to a working system', 58, 310, { width: 480 });
  const items: [string, string][] = [
    ['01  Site assessment', 'Review the installation site and understand the project requirements.'],
    ['02  System proposal', 'Prepare a project configuration and quotation for your review.'],
    ['03  Installation planning', 'Coordinate the installation plan, equipment, and project schedule.'],
    ['04  Handover and support', 'Complete commissioning and provide project handover information.']
  ];
  let y = 356;
  for (const [title, description] of items) {
    doc.roundedRect(58, y, 478, 78, 8).fill('#ffffff');
    doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(11).text(title, 76, y + 16, { width: 440 });
    doc.fillColor('#46534a').font('Helvetica').fontSize(9).text(description, 76, y + 38, { width: 438 });
    y += 91;
  }
  doc.fillColor('#14532d').font('Helvetica-Bold').fontSize(11).text('Sunvika Private Limited', 58, 747);
  doc.fillColor('#526157').font('Helvetica').fontSize(8).text('Talk with our team to discuss a solar project for your site.', 58, 765);
  doc.fillColor('#647067').fontSize(7).text('Project configuration, output, pricing, and timelines depend on site conditions and the final proposal.', 58, 801, { width: 478 });
  return pdfBuffer(doc);
}
