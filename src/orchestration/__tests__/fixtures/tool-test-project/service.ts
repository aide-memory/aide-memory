import { Item } from './types';
import { calculateTotal, formatPrice } from './utils';

export class OrderService {
  private items: Item[] = [];

  addItem(item: Item): void {
    this.items.push(item);
  }

  getTotal(): string {
    const total = calculateTotal(this.items);
    return formatPrice(total);
  }

  getItemCount(): number {
    return this.items.length;
  }
}
