export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
}

export const DEFAULT_CURRENCY = 'PEN';

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: 'PEN', symbol: 'S/.', name: 'Sol Peruano' },
  { code: 'USD', symbol: '$', name: 'Dólar Estadounidense' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'MXN', symbol: '$', name: 'Peso Mexicano' },
  { code: 'COP', symbol: '$', name: 'Peso Colombiano' },
  { code: 'CLP', symbol: '$', name: 'Peso Chileno' },
  { code: 'ARS', symbol: '$', name: 'Peso Argentino' },
  { code: 'BRL', symbol: 'R$', name: 'Real Brasileño' },
  { code: 'GBP', symbol: '£', name: 'Libra Esterlina' },
];

export function getCurrencySymbol(code?: string): string {
  if (!code) return 'S/.';
  const found = SUPPORTED_CURRENCIES.find((c) => c.code.toUpperCase() === code.toUpperCase());
  return found ? found.symbol : code;
}
