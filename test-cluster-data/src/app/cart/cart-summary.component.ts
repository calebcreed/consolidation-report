
import { Component, Input } from '@angular/core';
import { CartSummary } from './cart.models';

@Component({
  selector: 'app-cart-summary',
  template: `
    <div class="cart-summary">
      <div>Items: {{summary.itemCount}}</div>
      <div>Subtotal: ${{summary.subtotal.toFixed(2)}}</div>
      <div>Tax: ${{summary.tax.toFixed(2)}}</div>
      <div>Shipping: ${{summary.shipping.toFixed(2)}}</div>
      <div class="total">Total: ${{summary.total.toFixed(2)}}</div>
    </div>
  `
})
export class CartSummaryComponent {
  @Input() summary!: CartSummary;
}
