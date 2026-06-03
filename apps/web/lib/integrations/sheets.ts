import * as XLSX from 'xlsx';
import { NABIS_SCHEMA_MAPPING, REQUIRED_NABIS_TABS } from '@/lib/data/sheets-schema';

export function inspectNabisWorkbook(path: string) {
  const workbook = XLSX.readFile(path, { cellDates: true });
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
