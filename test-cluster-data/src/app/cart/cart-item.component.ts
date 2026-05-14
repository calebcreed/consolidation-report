
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CartItem } from './cart.models';
import { CartService } from './cart.service';

@Component({
  selector: 'app-cart-item',
  template: `
    <div class="cart-item">
      <img [src]="item.image" [alt]="item.productName">
      <span>{{item.productName}}</span>
      <input type="number" [value]="item.quantity" (change)="updateQty($event)">
      <span>${{item.price * item.quantity}}</span>
      <button (click)="remove.emit()">Remove</button>
    </div>
  `
})
export class CartItemComponent {
  @Input() item!: CartItem;
  @Output() remove = new EventEmitter<void>();

  constructor(private cartService: CartService) {}

  updateQty(event: Event) {
    const qty = +(event.target as HTMLInputElement).value;
    this.cartService.updateQuantity(this.item.productId, qty);
  }
}
