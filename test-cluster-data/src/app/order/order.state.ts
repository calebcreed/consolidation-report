
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Order } from './order.models';

@Injectable({ providedIn: 'root' })
export class OrderState {
  private orders$ = new BehaviorSubject<Order[]>([]);
  private currentOrder$ = new BehaviorSubject<Order | null>(null);

  setOrders(orders: Order[]): void {
    this.orders$.next(orders);
  }

  getOrders(): Order[] {
    return this.orders$.value;
  }

  setCurrentOrder(order: Order): void {
    this.currentOrder$.next(order);
  }
}
