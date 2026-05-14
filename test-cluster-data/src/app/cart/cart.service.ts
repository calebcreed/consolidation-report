
import { Injectable } from '@angular/core';
import { CartItem, Cart, CartSummary } from './cart.models';
import { CartState } from './cart.state';
import { CartApi } from './cart.api';

@Injectable({ providedIn: 'root' })
export class CartService {
  constructor(private state: CartState, private api: CartApi) {}

  addItem(productId: string, quantity: number): void {
    this.state.addItem({ productId, quantity, price: 0 });
  }

  removeItem(productId: string): void {
    this.state.removeItem(productId);
  }

  updateQuantity(productId: string, quantity: number): void {
    this.state.updateQuantity(productId, quantity);
  }

  getCart(): Cart {
    return this.state.getCart();
  }

  getSummary(): CartSummary {
    return this.state.getSummary();
  }

  async checkout(): Promise<string> {
    const cart = this.getCart();
    const orderId = await this.api.checkout(cart);
    this.state.clearCart();
    return orderId;
  }
}
