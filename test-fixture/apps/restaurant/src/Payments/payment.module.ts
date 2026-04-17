import { NgModule } from '@angular/core';

// Connect payment module to payment service
import { PaymentService } from '../app/services/payment.service';

// Lazy-loaded module target for A10
@NgModule({
  declarations: [],
  imports: [],
  providers: [PaymentService],
})
export class PaymentModule {}
