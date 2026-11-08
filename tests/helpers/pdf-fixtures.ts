import { deflateSync } from 'node:zlib';
import { createCanvas } from '@napi-rs/canvas';

// Builds a minimal, valid PDF with the requested number of blank pages.
// Only ASCII is used, so each character is one byte and string lengths are byte offsets.
export function createBlankPdf(pageCount: number): Uint8Array {
  const pageObjectIds = Array.from({ length: pageCount }, (_, index) => index + 3);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    ...pageObjectIds.map(() => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>'),
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}


// Builds a file that starts with %PDF- but contains corrupted structure.
export function createDamagedPdf(): Uint8Array {
  return new TextEncoder().encode('%PDF-1.4\ncorrupted content without valid pdf catalog or xref\n%%EOF\n');
}

// Builds a valid PDF that requires a password to open.
export function createProtectedPdf(): Uint8Array {
  const pdfStr =
    '%PDF-1.4\n' +
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
    '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n' +
    '3 0 obj\n<< /Filter /Standard /V 1 /R 2 /O (12345678901234567890123456789012) /U (12345678901234567890123456789012) /P -4 >>\nendobj\n' +
    'xref\n0 4\n' +
    '0000000000 65535 f \n' +
    '0000000009 00000 n \n' +
    '0000000058 00000 n \n' +
    '0000000109 00000 n \n' +
    'trailer\n<< /Size 4 /Root 1 0 R /Encrypt 3 0 R /ID [<12345678901234567890123456789012> <12345678901234567890123456789012>] >>\n' +
    'startxref\n236\n%%EOF\n';
  return new TextEncoder().encode(pdfStr);
}


function escapePdfText(text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

// Builds a valid PDF with textual content on the specified pages.
export function createTextPdf(pages: readonly string[]): Uint8Array {
  const fontObj = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  const numPages = pages.length;
  const objects: string[] = [];

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const pageIds = pages.map((_, i) => 5 + i * 2);
  objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${numPages} >>`);
  objects.push(fontObj);

  pages.forEach((pageText, i) => {
    const lines = pageText.split('\n');
    let streamBody = 'BT\n/F1 12 Tf\n72 700 Td\n';
    lines.forEach((line, lineIdx) => {
      streamBody += `(${escapePdfText(line)}) Tj\n`;
      if (lineIdx < lines.length - 1) {
        streamBody += '0 -16 Td\n';
      }
    });
    streamBody += 'ET\n';
    const streamObj = `<< /Length ${streamBody.length} >>\nstream\n${streamBody}endstream`;
    objects.push(streamObj);
    const pageObj = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${4 + i * 2} 0 R >>`;
    objects.push(pageObj);
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, idx) => {
    offsets.push(pdf.length);
    pdf += `${idx + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}


// Builds a scanned PDF where each page contains only an image (no PDF text operators),
// simulating a scanned document with text drawn as raster pixels.
export function createScannedPdf(pagesText: readonly string[]): Uint8Array {
  // Wide enough for a full sentence: text drawn past the edge is cut off and OCR cannot read it.
  const width = 800;
  const height = 100;
  const pageCount = pagesText.length;

  const objects: Array<string | { header: string; body: Buffer; footer: string }> = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const pageIds = pagesText.map((_, i) => 3 + i * 3 + 2);
  objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`);

  pagesText.forEach((text, i) => {
    const c = createCanvas(width, height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'black';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(text, 20, 55);

    const imgData = ctx.getImageData(0, 0, width, height);
    const rgb = Buffer.alloc(width * height * 3);
    for (let k = 0, j = 0; k < imgData.data.length; k += 4, j += 3) {
      rgb[j] = imgData.data[k];
      rgb[j + 1] = imgData.data[k + 1];
      rgb[j + 2] = imgData.data[k + 2];
    }
    const deflated = deflateSync(rgb);

    const imgId = 3 + i * 3;
    const contentsId = imgId + 1;

    const imgObj = {
      header: `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${deflated.length} >>\nstream\n`,
      body: deflated,
      footer: '\nendstream',
    };
    const contentsBody = `q ${width} 0 0 ${height} 0 0 cm /Im1 Do Q\n`;
    const contentsObj = `<< /Length ${contentsBody.length} >>\nstream\n${contentsBody}endstream`;
    const pageObj = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im1 ${imgId} 0 R >> >> /Contents ${contentsId} 0 R >>`;

    objects.push(imgObj, contentsObj, pageObj);
  });

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  let offset = chunks[0].length;
  const offsets: number[] = [];

  objects.forEach((obj, idx) => {
    offsets.push(offset);
    const start = `${idx + 1} 0 obj\n`;
    const end = '\nendobj\n';
    if (typeof obj === 'string') {
      const b = Buffer.from(start + obj + end);
      chunks.push(b);
      offset += b.length;
    } else {
      const bStart = Buffer.from(start + obj.header);
      const bEnd = Buffer.from(obj.footer + end);
      chunks.push(bStart, obj.body, bEnd);
      offset += bStart.length + obj.body.length + bEnd.length;
    }
  });

  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => {
    xref += `${String(o).padStart(10, '0')} 00000 n \n`;
  });
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref));

  return new Uint8Array(Buffer.concat(chunks));
}

export interface MixedPdfPage {
  kind: 'digital' | 'scanned';
  text: string;
}

// Builds a PDF that mixes digital-text pages (real PDF text operators) with scanned pages
// (text drawn as an image only), in the order given.
export function createMixedPdf(pages: readonly MixedPdfPage[]): Uint8Array {
  const width = 800;
  const height = 100;
  type PdfObject = string | { header: string; body: Buffer; footer: string };
  const objects: PdfObject[] = [];
  const pageIds: number[] = [];
  const nextId = () => objects.length + 1;

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< >>'); // Placeholder for the page tree, filled in once page ids are known.
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'); // Object 3.

  for (const { kind, text } of pages) {
    if (kind === 'digital') {
      const streamBody = `BT\n/F1 12 Tf\n72 700 Td\n(${escapePdfText(text)}) Tj\nET\n`;
      const contentsId = nextId();
      objects.push(`<< /Length ${streamBody.length} >>\nstream\n${streamBody}endstream`);
      pageIds.push(nextId());
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentsId} 0 R >>`,
      );
      continue;
    }

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'black';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(text, 20, 55);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const rgb = Buffer.alloc(width * height * 3);
    for (let k = 0, j = 0; k < rgba.length; k += 4, j += 3) {
      rgb[j] = rgba[k];
      rgb[j + 1] = rgba[k + 1];
      rgb[j + 2] = rgba[k + 2];
    }
    const deflated = deflateSync(rgb);

    const imageId = nextId();
    objects.push({
      header: `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${deflated.length} >>\nstream\n`,
      body: deflated,
      footer: '\nendstream',
    });
    const contentsId = nextId();
    const contentsBody = `q ${width} 0 0 ${height} 0 0 cm /Im1 Do Q\n`;
    objects.push(`<< /Length ${contentsBody.length} >>\nstream\n${contentsBody}endstream`);
    pageIds.push(nextId());
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im1 ${imageId} 0 R >> >> /Contents ${contentsId} 0 R >>`,
    );
  }

  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  let offset = chunks[0].length;
  const offsets: number[] = [];
  objects.forEach((obj, idx) => {
    offsets.push(offset);
    const start = `${idx + 1} 0 obj\n`;
    const end = '\nendobj\n';
    const parts =
      typeof obj === 'string'
        ? [Buffer.from(start + obj + end)]
        : [Buffer.from(start + obj.header), obj.body, Buffer.from(obj.footer + end)];
    for (const part of parts) {
      chunks.push(part);
      offset += part.length;
    }
  });

  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  xref += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref));

  return new Uint8Array(Buffer.concat(chunks));
}
