import { fromUsd } from "@autonomos/schemas";
export function money(amount: number | null | undefined, currency = "EUR", digits = 0) {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "–";
  return new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(amount);
}

export function usd(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return "–";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: amount < 1 ? 4 : 2 }).format(amount);
}

// AI spend (priced in US dollars) in the workspace currency, at the reference rate, so every
// amount on a page is in one currency. Small amounts keep enough digits to be readable.
export function aiMoney(usdAmount: number | null | undefined, currency = "EUR") {
  if (usdAmount === null || usdAmount === undefined || !Number.isFinite(usdAmount)) return "–";
  const local = fromUsd(usdAmount, currency);
  return money(local, currency, local > 0 && local < 1 ? 3 : 2);
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

// A connected system's key as people read it: "google_drive" → "Google drive".
export function systemName(key: string) {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// A run's error as people read it. Technical text from a connected system or the model is
// translated by kind; anything already plain is kept.
export function friendlyRunError(error: string, kind: string): string {
  switch (kind) {
    case "rate_limited":
      return `A connected system asked AutonomOS to slow down, and the retries it made by itself did not get through. (${error.slice(0, 160)})`;
    case "timeout":
    case "network":
    case "upstream_unavailable":
      return `A connected system did not answer, also after AutonomOS retried by itself. It is usually back within minutes. (${error.slice(0, 160)})`;
    case "not_connected":
    case "permission_denied":
      return `A connected system refused access: its sign-in may have expired or lacks a permission. Reconnect it on the Integrations page. (${error.slice(0, 160)})`;
    default:
      return error;
  }
}
