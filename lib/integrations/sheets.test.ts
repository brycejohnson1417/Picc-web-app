import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { inspectNabisWorkbook } from './sheets';

const folders: string[] = [];
function file(name: string, content: string | Buffer) {
  const folder = mkdtempSync(join(tmpdir(), 'picc-sheet-test-'));
  folders.push(folder);
  const path = join(folder, name);
  writeFileSync(path, content);
  return path;
}
afterEach(() => folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true })));
it('rejects unsupported file types before parsing', () => {
  expect(() => inspectNabisWorkbook(file('report.html', '<table><tr><td>Accounts</td></tr></table>'))).toThrow('file type');
});
it('rejects an oversized workbook before parsing', () => {
  expect(() => inspectNabisWorkbook(file('report.xlsx', Buffer.alloc(10 * 1024 * 1024 + 1)))).toThrow('10 MB');
});
it('rejects text disguised as a workbook', () => {
  expect(() => inspectNabisWorkbook(file('report.xlsx', 'Account,Value\nExample,12'))).toThrow('valid Excel');
});
it('preserves workbook tab coverage and row samples', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Name','Value'],['Example',12]]), 'orders');
  const result = inspectNabisWorkbook(file('report.xlsx', XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })));
  expect(result.tabs).toEqual(['orders']);
  expect(result.sample).toContainEqual({ tab:'orders', header:['Name','Value'], firstDataRow:['Example',12], rowCount:2 });
});
