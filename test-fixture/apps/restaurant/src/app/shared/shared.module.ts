import { NgModule } from '@angular/core';

// A4: Components/Pipes declared in this module
import { CurrencyPipe } from './currency.pipe';

@NgModule({
  imports: [],                    // A3: Module imports (none for this basic shared module)
  declarations: [CurrencyPipe],   // A4: Declare the pipe
  exports: [CurrencyPipe],        // A6: Export so other modules can use it
  providers: [],                  // A5: No providers in this module
})
export class SharedModule {}
