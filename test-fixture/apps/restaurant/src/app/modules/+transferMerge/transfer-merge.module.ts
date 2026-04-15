import { NgModule } from '@angular/core';

// A3: Import other modules
import { SharedModule } from '../../shared/shared.module';

// A4: Components declared in this module (via barrel)
import { components, TabletTransferComponent } from './components';

// A5: Services provided by this module
import { CommonService } from '@core/services';

@NgModule({
  imports: [
    SharedModule,            // A3: Import SharedModule to use CurrencyPipe
  ],
  declarations: [
    ...components,           // A4: Declare all components from barrel
  ],
  providers: [
    CommonService,           // A5: Provide service at module level
  ],
  exports: [
    TabletTransferComponent, // A6: Export for use in other modules
  ]
})
export class TransferMergeModule {}
