export function normalizeVietnameseCurrencyInput(input: string) {
  const cleaned = input.replace(/[^\d.,]/g, "");
  if (!cleaned) return "";

  const commaIndex = cleaned.indexOf(",");
  const hasDecimalSeparator = commaIndex !== -1;
  const integerRaw = hasDecimalSeparator ? cleaned.slice(0, commaIndex) : cleaned;
  const decimalRaw = hasDecimalSeparator ? cleaned.slice(commaIndex + 1) : "";

  const integerDigits = integerRaw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const decimalDigits = decimalRaw.replace(/\D/g, "").slice(0, 2);
  const groupedInteger = (integerDigits || (hasDecimalSeparator ? "0" : "")).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return hasDecimalSeparator ? `${groupedInteger},${decimalDigits}` : groupedInteger;
}

export function parseVietnameseCurrencyInput(input: string): number | null {
  const normalized = normalizeVietnameseCurrencyInput(input);
  if (!normalized) return null;

  const [integerPart, decimalPart = ""] = normalized.split(",");
  const integerDigits = integerPart.replace(/\D/g, "");
  const decimalDigits = decimalPart.replace(/\D/g, "").slice(0, 2);
  if (!integerDigits && !decimalDigits) return null;

  const value = Number(`${integerDigits || "0"}${decimalDigits ? `.${decimalDigits}` : ""}`);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

export function formatVietnameseCurrencyValue(value?: number | null) {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return "";
  const amount = Number(value);
  return amount.toLocaleString("vi-VN", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
