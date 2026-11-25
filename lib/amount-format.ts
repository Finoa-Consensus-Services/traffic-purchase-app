export function parseAmount(raw: string) {
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) ? value : Number.NaN;
}

/** Group the integer part as the user types. A trailing decimal and its digits stay as typed. */
export function formatGroupedAmount(raw: string) {
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const dot = cleaned.indexOf(".");
  const whole = dot === -1 ? cleaned : cleaned.slice(0, dot);
  const fraction = dot === -1 ? null : cleaned.slice(dot + 1).replace(/\./g, "");
  const digits = whole.replace(/^0+(?=\d)/, "");
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (fraction === null) return grouped;
  return `${grouped}.${fraction}`;
}

export function formatCc(value: number) {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} CC`;
}

export function formatUsd(value: number) {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} USD`;
}
