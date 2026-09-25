export function money(amount: number | null | undefined, currency = "EUR", digits = 0) {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "–";
  return new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(amount);
}

export function usd(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return "–";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: amount < 1 ? 4 : 2 }).format(amount);
}

export function pct(v: number | null | undefined, digits = 0) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return `${(v * 100).toFixed(digits)}%`;
}

export function hours(minutes: number | null | undefined) {
  if (!minutes) return "0 h";
  const h = minutes / 60;
  return h >= 10 ? `${Math.round(h)} h` : `${Math.round(h * 10) / 10} h`;
}

export function num(v: number | null | undefined) {
  if (v === null || v === undefined) return "–";
  return new Intl.NumberFormat("en-IE").format(v);
}

export function dateTime(v: string | Date | null | undefined) {
  if (!v) return "–";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v));
}

export function time(v: string | Date) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(v));
}

export function relative(v: string | Date) {
  const diff = (Date.now() - new Date(v).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

export const FREQUENCY_LABEL: Record<string, string> = {
  ad_hoc: "Ad hoc",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  event_driven: "When it happens",
};
