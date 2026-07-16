import { intlLocale, type Locale } from "./config";

export function formatNumber(locale: Locale, value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(intlLocale(locale), options).format(value);
}

export function formatDate(locale: Locale, value: Date | number, options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(value);
}

export function formatTime(locale: Locale, value: Date | number, options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }) {
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(value);
}

export function formatCurrency(locale: Locale, value: number, currencyCode: string) {
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: currencyCode }).format(value);
}
