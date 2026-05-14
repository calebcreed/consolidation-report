
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Cart, CartPromo } from './cart.models';

@Injectable({ providedIn: 'root' })
export class CartApi {
  constructor(private http: HttpClient) {}

  async checkout(cart: Cart): Promise<string> {
    const res = await this.http.post<{ orderId: string }>('/api/checkout', cart).toPromise();
    return res.orderId;
  }

  async applyPromo(code: string): Promise<CartPromo> {
    return this.http.post<CartPromo>('/api/cart/promo', { code }).toPromise();
  }

  async saveCart(cart: Cart): Promise<void> {
    await this.http.post('/api/cart', cart).toPromise();
  }
}
