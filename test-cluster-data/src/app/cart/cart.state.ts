
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Cart, CartItem, CartSummary } from './cart.models';

@Injectable({ providedIn: 'root' })
export class CartState {
  private cart$ = new BehaviorSubject<Cart>({ items: [], createdAt: new Date(), updatedAt: new Date() });

  addItem(item: CartItem): void {
    const cart = this.cart$.value;
    const existing = cart.items.find(i => i.productId === item.productId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      cart.items.push(item);
    }
    this.cart$.next({ ...cart, updatedAt: new Date() });
  }

  removeItem(productId: string): void {
    const cart = this.cart$.value;
    cart.items = cart.items.filter(i => i.productId !== productId);
    this.cart$.next({ ...cart, updatedAt: new Date() });
  }

  updateQuantity(productId: string, quantity: number): void {
    const cart = this.cart$.value;
    const item = cart.items.find(i => i.productId === productId);
    if (item) item.quantity = quantity;
    this.cart$.next({ ...cart, updatedAt: new Date() });
  }

  getCart(): Cart {
    return this.cart$.value;
  }

  getSummary(): CartSummary {
    const cart = this.cart$.value;
    const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    return { itemCount: cart.items.length, subtotal, tax: subtotal * 0.08, shipping: 5.99, total: subtotal * 1.08 + 5.99 };
  }

  clearCart(): void {
    this.cart$.next({ items: [], createdAt: new Date(), updatedAt: new Date() });
  }
}
