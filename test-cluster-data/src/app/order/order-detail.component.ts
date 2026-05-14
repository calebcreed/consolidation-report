
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { OrderService } from './order.service';
import { Order } from './order.models';

@Component({
  selector: 'app-order-detail',
  template: `
    <div class="order-detail" *ngIf="order">
      <h2>Order #{{order.id}}</h2>
      <app-order-status [status]="order.status"></app-order-status>
      <div *ngFor="let item of order.items">
        {{item.productName}} x{{item.quantity}} - ${{item.price}}
      </div>
      <div class="total">Total: ${{order.total}}</div>
      <button *ngIf="order.status === 'pending'" (click)="cancel()">Cancel Order</button>
    </div>
  `
})
export class OrderDetailComponent implements OnInit {
  order: Order | null = null;

  constructor(private route: ActivatedRoute, private orderService: OrderService) {}

  async ngOnInit() {
    const id = this.route.snapshot.params['id'];
    this.order = await this.orderService.getOrder(id);
  }

  async cancel() {
    if (this.order) await this.orderService.cancelOrder(this.order.id);
  }
}
