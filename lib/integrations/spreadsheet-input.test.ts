import { expect, it } from 'vitest';
import { requireReportSize, parseReportRows } from './spreadsheet-input';

it('accepts a normal CSV with quoted commas and Unicode', () => {
  expect(() => requireReportSize('Name,Price\n"Café, large",12')).not.toThrow();
});
it('rejects oversized text by bytes rather than character count', () => {
  expect(() => requireReportSize('é'.repeat(1024 * 1024 + 1))).toThrow('2 MB');
});

it('preserves quoted commas, Unicode, leading zeros, and prices in CSV reports', () => {
  expect(parseReportRows('Name,SKU,Price\n"Café, large",0012,12.50')).toEqual({
    format: 'csv', rows: [{ Name: 'Café, large', SKU: '0012', Price: '12.50' }],
  });
});
it('retains JSON rows and rejects malformed JSON', () => {
  expect(parseReportRows('[{"Name":"Example","Price":12}]').rows).toEqual([{Name:'Example',Price:12}]);
  expect(() => parseReportRows('[broken')).toThrow();
});
it('rejects excessive columns without returning a truncated report', () => {
  expect(() => parseReportRows(Array.from({length:257}, (_,i) => `column${i}`).join(','))).toThrow('256 column');
});
