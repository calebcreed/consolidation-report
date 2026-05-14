
import { Component, OnInit } from '@angular/core';
import { CartService } from './cart.service';
import { Cart, CartSummary } from './cart.models';
import { CartState } from './cart.state';

@Component({
  selector: 'app-cart',
  template: `
    <div class="cart">
      <h2>Shopping Cart</h2>
      <app-cart-item *ngFor="let item of cart.items" [item]="item" (remove)="remove(item.productId)"></app-cart-item>
      <app-cart-summary [summary]="summary"></app-cart-summary>
      <button (click)="checkout()">Checkout</button>
    </div>
  `
})
export class CartComponent implements OnInit {
  cart!: Cart;
  summary!: CartSummary;

  constructor(private cartService: CartService, private state: CartState) {}

  ngOnInit() {
    this.cart = this.cartService.getCart();
    this.summary = this.cartService.getSummary();
  }

  remove(productId: string) {
    this.cartService.removeItem(productId);
  }

  checkout() {
    this.cartService.checkout();
  }
}
