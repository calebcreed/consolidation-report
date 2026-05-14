
import { Component, OnInit } from '@angular/core';
import { OrderService } from './order.service';
import { Order } from './order.models';

@Component({
  selector: 'app-order-list',
  template: `
    <div class="orders">
      <h2>My Orders</h2>
      <div *ngFor="let order of orders" class="order-row" [routerLink]="['/orders', order.id]">
        <span>#{{order.id}}</span>
        <span>{{order.createdAt | date}}</span>
        <app-order-status [status]="order.status"></app-order-status>
        <span>${{order.total}}</span>
      </div>
    </div>
  `
})
export class OrderListComponent implements OnInit {
  orders: Order[] = [];

  constructor(private orderService: OrderService) {}

  async ngOnInit() {
    this.orders = await this.orderService.getOrders();
  }
}
