import { NgModule } from '@angular/core';

// A10: Lazy loaded routes - dynamic import creates dependency
const routes = [
  {
    path: 'transfer',
    // A10: loadChildren with dynamic import - this IS a dependency!
    loadChildren: () => import('./modules/+transferMerge/transfer-merge.module')
      .then(m => m.TransferMergeModule)
  },
  {
    path: 'payments',
    // A10: Another lazy route using baseUrl
    loadChildren: () => import('Payments/payment.module')
      .then(m => m.PaymentModule)
  }
];

@NgModule({
  imports: [],  // RouterModule.forRoot(routes)
  exports: []   // RouterModule
})
export class AppRoutingModule {}
