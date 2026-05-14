
import { Component, Input } from '@angular/core';
import { Order, OrderStatus } from './order.models';

@Component({
  selector: 'app-order-tracking',
  template: `
    <div class="tracking">
      <div *ngFor="let step of steps" [class.active]="isActive(step)" [class.complete]="isComplete(step)">
        {{step | titlecase}}
      </div>
    </div>
  `
})
export class OrderTrackingComponent {
  @Input() order!: Order;
  steps: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

  isActive(step: OrderStatus): boolean {
    return this.order?.status === step;
  }

  isComplete(step: OrderStatus): boolean {
    return this.steps.indexOf(step) < this.steps.indexOf(this.order?.status);
  }
}
