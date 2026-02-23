export interface Item {
  name: string;
  price: number;
}

export type Currency = 'USD' | 'EUR';

export function formatCurrency(amount: number, currency: Currency): string {
  const symbols: Record<Currency, string> = { USD: '$', EUR: '€' };
  return `${symbols[currency]}${amount.toFixed(2)}`;
}
