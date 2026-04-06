/**
 * Export data as a CSV file with UTF-8 BOM, which Excel opens correctly
 * as a spreadsheet. Uses semicolon as delimiter (standard for pt-BR locales).
 */
export function exportToExcel(data: Record<string, any>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csvContent =
    '\uFEFF' + // UTF-8 BOM so Excel detects encoding
    headers.join(';') + '\n' +
    data
      .map((row) =>
        headers
          .map((h) => {
            const val = row[h] ?? '';
            const str = String(val);
            return str.includes(';') || str.includes('\n') || str.includes('"')
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          })
          .join(';')
      )
      .join('\n');

  const blob = new Blob([csvContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
