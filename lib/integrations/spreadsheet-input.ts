import * as XLSX from 'xlsx';

export const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024;
export const MAX_REPORT_BYTES = 2 * 1024 * 1024;
export const MAX_SHEET_ROWS = 50_000;

export function requireReportSize(input: string) {
  if (Buffer.byteLength(input, 'utf8') > MAX_REPORT_BYTES) {
    const error = new Error('Report exceeds the 2 MB limit. Split the export into smaller reports.');
    Object.assign(error, { statusCode: 400 });
    throw error;
  }
}

export function parseReportRows(rawInput: string) {
  requireReportSize(rawInput);
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { format: 'json' as const, rows: [] as Record<string, unknown>[] };
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return {
        format: 'json' as const,
        rows: parsed.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object'),
      };
    }
    throw new Error('Expected a JSON array of Headset rows.');
  }

  const workbook = XLSX.read(trimmed, { type: 'string', raw: false, sheetRows: MAX_SHEET_ROWS + 1 });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { format: 'csv' as const, rows: [] as Record<string, unknown>[] };
  }
  const sheet = workbook.Sheets[firstSheetName];
  const range = sheet['!fullref'] || sheet['!ref'];
  if (range && XLSX.utils.decode_range(range).e.c >= 256) {
    throw Object.assign(new Error('Report exceeds the 256 column limit.'), { statusCode: 400 });
  }
  if (range && XLSX.utils.decode_range(range).e.r >= MAX_SHEET_ROWS) {
    throw Object.assign(new Error('Report exceeds the 50,000 row limit.'), { statusCode: 400 });
  }
  return {
    format: 'csv' as const,
    rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false }),
  };
}

