
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrderService } from './order.service';
import { OrderApi } from './order.api';
import { OrderState } from './order.state';
import { OrderListComponent } from './order-list.component';
import { OrderDetailComponent } from './order-detail.component';
import { OrderStatusComponent } from './order-status.component';
import { OrderTrackingComponent } from './order-tracking.component';
import { OrderInvoiceComponent } from './order-invoice.component';

@NgModule({
  imports: [CommonModule],
  declarations: [OrderListComponent, OrderDetailComponent, OrderStatusComponent, OrderTrackingComponent, OrderInvoiceComponent],
  providers: [OrderService, OrderApi, OrderState],
  exports: [OrderListComponent, OrderDetailComponent, OrderStatusComponent, OrderTrackingComponent, OrderInvoiceComponent]
})
export class OrderModule {}
