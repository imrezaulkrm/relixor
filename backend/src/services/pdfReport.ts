export interface PdfReportRow {
  application: string;
  version: string;
  versionCode: number;
  channel: string;
  status: string;
  qaResult: string;
  qaReviewers: string;
  publishedAt: string;
}

export interface PdfReportInput {
  title: string;
  subtitle: string;
  generatedAt: string;
  summary: string[];
  rows: PdfReportRow[];
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 40;
const ROWS_PER_PAGE = 28;

function ascii(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function text(x: number, y: number, size: number, value: string, bold = false): string {
  return `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${ascii(value)}) Tj ET\n`;
}

function rule(y: number): string {
  return `0.7 w 0.75 0.75 0.75 RG ${MARGIN} ${y} m ${PAGE_WIDTH - MARGIN} ${y} l S\n`;
}

function pageContent(input: PdfReportInput, rows: PdfReportRow[], pageIndex: number, totalPages: number): string {
  let content = '';
  content += text(MARGIN, 795, 18, input.title, true);
  content += text(MARGIN, 776, 9, input.subtitle);
  content += text(MARGIN, 762, 9, `Generated: ${input.generatedAt}`);
  let y = 744;
  for (const summary of input.summary) {
    content += text(MARGIN, y, 9, summary);
    y -= 13;
  }

  const columns = [
    { label: 'Application', x: MARGIN, max: 24 },
    { label: 'Version', x: 190, max: 14 },
    { label: 'Code', x: 258, max: 8 },
    { label: 'Channel', x: 300, max: 11 },
    { label: 'Status', x: 368, max: 16 },
    { label: 'QA Result', x: 450, max: 12 },
    { label: 'Reviewer', x: 510, max: 13 },
  ];

  y = Math.min(y - 8, 690);
  for (const col of columns) content += text(col.x, y, 8, col.label, true);
  y -= 5;
  content += rule(y);
  y -= 14;

  for (const row of rows) {
    const values = [
      truncate(row.application, 24),
      truncate(row.version, 14),
      String(row.versionCode),
      truncate(row.channel, 11),
      truncate(row.status, 16),
      truncate(row.qaResult, 12),
      truncate(row.qaReviewers, 13),
    ];
    columns.forEach((col, i) => {
      content += text(col.x, y, 8, values[i]);
    });
    y -= 14;
  }

  content += rule(48);
  content += text(MARGIN, 34, 8, `Relixor QA report - page ${pageIndex + 1} of ${totalPages}`);
  content += text(PAGE_WIDTH - MARGIN - 120, 34, 8, input.generatedAt);
  return content;
}

/**
 * Minimal PDF 1.4 writer: Helvetica text, one table, page numbers. No external dependency.
 */
export function buildPdfReport(input: PdfReportInput): Buffer {
  const pages: PdfReportRow[][] = [];
  for (let i = 0; i < input.rows.length; i += ROWS_PER_PAGE) {
    pages.push(input.rows.slice(i, i + ROWS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);

  const FONT_REGULAR = 3;
  const FONT_BOLD = 4;
  const FIRST_PAGE = 5;
  const pageObjectIds = pages.map((_, i) => FIRST_PAGE + i * 2);
  const contentObjectIds = pages.map((_, i) => FIRST_PAGE + i * 2 + 1);

  const objects = new Map<number, Buffer>();
  const setObject = (id: number, body: string | Buffer) => {
    objects.set(id, Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'));
  };

  setObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  setObject(2, `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  setObject(FONT_REGULAR, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  setObject(FONT_BOLD, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  pages.forEach((rows, index) => {
    const content = Buffer.from(pageContent(input, rows, index, pages.length), 'latin1');
    setObject(
      contentObjectIds[index],
      Buffer.concat([
        Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1'),
        content,
        Buffer.from('\nendstream', 'latin1'),
      ])
    );
    setObject(
      pageObjectIds[index],
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${FONT_REGULAR} 0 R /F2 ${FONT_BOLD} 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`
    );
  });

  const maxId = Math.max(...Array.from(objects.keys()));
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  let offset = chunks[0].length;
  const offsets = new Map<number, number>();

  for (let id = 1; id <= maxId; id += 1) {
    const body = objects.get(id);
    if (!body) continue;
    offsets.set(id, offset);
    const header = Buffer.from(`${id} 0 obj\n`, 'latin1');
    const footer = Buffer.from('\nendobj\n', 'latin1');
    chunks.push(header, body, footer);
    offset += header.length + body.length + footer.length;
  }

  const xrefOffset = offset;
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) {
    const objectOffset = offsets.get(id);
    xref +=
      objectOffset === undefined
        ? '0000000000 65535 f \n'
        : `${String(objectOffset).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));

  return Buffer.concat(chunks);
}
