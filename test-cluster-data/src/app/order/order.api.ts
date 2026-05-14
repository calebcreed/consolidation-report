
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Order, OrderStatus, OrderFilter } from './order.models';

@Injectable({ providedIn: 'root' })
export class OrderApi {
  private baseUrl = '/api/orders';

  constructor(private http: HttpClient) {}

  getOrders(filter?: OrderFilter): Promise<Order[]> {
    return this.http.get<Order[]>(this.baseUrl, { params: filter as any }).toPromise();
  }

  getOrder(id: string): Promise<Order> {
    return this.http.get<Order>(`${this.baseUrl}/${id}`).toPromise();
  }

  updateStatus(id: string, status: OrderStatus): Promise<Order> {
    return this.http.patch<Order>(`${this.baseUrl}/${id}/status`, { status }).toPromise();
  }

  cancelOrder(id: string): Promise<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`).toPromise();
  }
}
