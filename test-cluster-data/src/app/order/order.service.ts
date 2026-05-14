
import { Injectable } from '@angular/core';
import { Order, OrderStatus, OrderFilter } from './order.models';
import { OrderApi } from './order.api';
import { OrderState } from './order.state';

@Injectable({ providedIn: 'root' })
export class OrderService {
  constructor(private api: OrderApi, private state: OrderState) {}

  async getOrders(filter?: OrderFilter): Promise<Order[]> {
    const orders = await this.api.getOrders(filter);
    this.state.setOrders(orders);
    return orders;
  }

  async getOrder(id: string): Promise<Order> {
    return this.api.getOrder(id);
  }

  async updateStatus(id: string, status: OrderStatus): Promise<Order> {
    return this.api.updateStatus(id, status);
  }

  async cancelOrder(id: string): Promise<void> {
    await this.api.cancelOrder(id);
  }
}
