import { Item } from './types';

export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

export function formatPrice(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function discountedTotal(items: Item[], discountPercent: number): number {
  const total = calculateTotal(items);
  return total * (1 - discountPercent / 100);
}
