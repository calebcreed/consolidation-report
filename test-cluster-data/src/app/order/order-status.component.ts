
import { Component, Input } from '@angular/core';
import { OrderStatus } from './order.models';

@Component({
  selector: 'app-order-status',
  template: `<span class="status" [class]="status">{{status | titlecase}}</span>`
})
export class OrderStatusComponent {
  @Input() status!: OrderStatus;
}
