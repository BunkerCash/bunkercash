export function formatPriceChartDate(dateStr: string) {
  const baseDate = dateStr.split(" ")[0] ?? dateStr;
  const [, m, d] = baseDate.split("-");
  if (!m || !d) {
    return dateStr;
  }
  return `${m}/${d}`;
}
