
import { Component, Input } from '@angular/core';
import { Order } from './order.models';

@Component({
  selector: 'app-order-invoice',
  template: `
    <div class="invoice" *ngIf="order">
      <h3>Invoice #{{order.id}}</h3>
      <table>
        <tr *ngFor="let item of order.items">
          <td>{{item.productName}}</td>
          <td>{{item.quantity}}</td>
          <td>${{item.price}}</td>
        </tr>
      </table>
      <div>Subtotal: ${{order.subtotal}}</div>
      <div>Tax: ${{order.tax}}</div>
      <div>Shipping: ${{order.shipping}}</div>
      <div class="total">Total: ${{order.total}}</div>
    </div>
  `
})
export class OrderInvoiceComponent {
  @Input() order!: Order;
}
