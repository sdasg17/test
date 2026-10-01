/**
 * Currency
 *
 * There is no exchange rate anywhere in this tool, deliberately. The payout
 * per event is entered by the user, so whatever currency they choose is the
 * currency the contract is written in and every other figure inherits it.
 * Converting would mean inventing an FX rate and a date, neither of which
 * would make the answer more true.
 */

export interface Currency {
  code: string;
  symbol: string;
  locale: string;
}

export const CURRENCIES: Currency[] = [
  { code: 'GBP', symbol: '£', locale: 'en-GB' },
  { code: 'EUR', symbol: '€', locale: 'de-DE' },
  { code: 'USD', symbol: '$', locale: 'en-US' },
  { code: 'INR', symbol: '₹', locale: 'en-IN' },
  { code: 'AED', symbol: 'AED ', locale: 'en-AE' },
  { code: 'SGD', symbol: 'S$', locale: 'en-SG' },
  { code: 'AUD', symbol: 'A$', locale: 'en-AU' },
  { code: 'ZAR', symbol: 'R', locale: 'en-ZA' },
  { code: 'BRL', symbol: 'R$', locale: 'pt-BR' },
  { code: 'JPY', symbol: '¥', locale: 'ja-JP' },
];

export const findCurrency = (code: string): Currency =>
  CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0];

export const money = (value: number, c: Currency, dp?: number): string => {
  if (!isFinite(value)) return '-';
  const decimals = dp ?? (Math.abs(value) >= 100 ? 0 : 2);
  return `${c.symbol}${value.toLocaleString(c.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

/** Short form for portfolio totals, which run to millions. */
export const moneyShort = (value: number, c: Currency): string => {
  if (!isFinite(value)) return '-';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${c.symbol}${(value / 1e9).toFixed(2)}bn`;
  if (abs >= 1e6) return `${c.symbol}${(value / 1e6).toFixed(1)}m`;
  if (abs >= 1e3) return `${c.symbol}${(value / 1e3).toFixed(0)}k`;
  return money(value, c, 0);
};

export const count = (n: number, c: Currency): string =>
  Math.round(n).toLocaleString(c.locale);
