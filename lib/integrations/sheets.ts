import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { MAX_WORKBOOK_BYTES, MAX_SHEET_ROWS } from './spreadsheet-input';
import * as XLSX from 'xlsx';
import { NABIS_SCHEMA_MAPPING, REQUIRED_NABIS_TABS } from '@/lib/data/sheets-schema';

export function inspectNabisWorkbook(path: string) {
  const extension = extname(path).toLowerCase();
  if (!['.xlsx', '.xls', '.csv'].includes(extension)) {
    throw new Error('Unsupported spreadsheet file type. Use XLSX, XLS, or CSV.');
  }
  const file = statSync(path);
  if (!file.isFile() || file.size > MAX_WORKBOOK_BYTES) {
    throw new Error('Workbook must be a regular file of at most 10 MB.');
  }
  const bytes = readFileSync(path);
  const zip = bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const ole = bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if ((extension === '.xlsx' && !zip) || (extension === '.xls' && !ole)) {
    throw new Error('File is not a valid Excel workbook.');
  }
  const workbook = XLSX.read(bytes, { type: 'buffer', cellDates: true, sheetRows: MAX_SHEET_ROWS + 1 });
  for (const sheet of Object.values(workbook.Sheets)) {
    const range = sheet['!fullref'] || sheet['!ref'];
    if (range && XLSX.utils.decode_range(range).e.c >= 256) {
      throw new Error('Workbook exceeds the 256 column limit per sheet.');
    }
    if (range && XLSX.utils.decode_range(range).e.r >= MAX_SHEET_ROWS) {
      throw new Error('Workbook exceeds the 50,000 row limit per sheet.');
    }
  }
  const tabs = workbook.SheetNames;

  const requiredCoverage = REQUIRED_NABIS_TABS.map((tab) => ({
    tab,
    present: tabs.includes(tab),
    mapping: NABIS_SCHEMA_MAPPING[tab as keyof typeof NABIS_SCHEMA_MAPPING] || null,
  }));

  const sample = requiredCoverage
    .filter((item) => item.present)
    .map((item) => {
      const sheet = workbook.Sheets[item.tab];
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false });
      return {
        tab: item.tab,
        header: rows[0] || [],
        firstDataRow: rows[1] || [],
        rowCount: rows.length,
      };
    });

  return {
    tabs,
    requiredCoverage,
    sample,
  };
}
