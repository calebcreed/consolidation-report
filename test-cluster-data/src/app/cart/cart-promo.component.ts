
import { Component } from '@angular/core';
import { CartApi } from './cart.api';
import { CartPromo } from './cart.models';

@Component({
  selector: 'app-cart-promo',
  template: `
    <div class="promo">
      <input [(ngModel)]="code" placeholder="Promo code">
      <button (click)="apply()">Apply</button>
      <span *ngIf="promo">-{{promo.discount}}{{promo.type === 'percent' ? '%' : '$'}}</span>
    </div>
  `
})
export class CartPromoComponent {
  code = '';
  promo: CartPromo | null = null;

  constructor(private api: CartApi) {}

  async apply() {
    this.promo = await this.api.applyPromo(this.code);
  }
}
