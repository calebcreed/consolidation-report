
import { Component } from '@angular/core';
import { CartState } from './cart.state';
import { CartSummary } from './cart.models';

@Component({
  selector: 'app-cart-icon',
  template: `
    <div class="cart-icon" (click)="toggle()">
      <span class="icon">🛒</span>
      <span class="badge" *ngIf="itemCount > 0">{{itemCount}}</span>
    </div>
  `
})
export class CartIconComponent {
  itemCount = 0;

  constructor(private state: CartState) {
    const summary = this.state.getSummary();
    this.itemCount = summary.itemCount;
  }

  toggle() {}
}
