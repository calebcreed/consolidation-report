import { NgModule } from '@angular/core';

// Connection 2: app.module → app-routing.module
import { AppRoutingModule } from './app-routing.module';

// Connection 3: app.module → core/index.ts (barrel)
import { CommonService, TestService } from './core';

// Connection 6: app.module → shared.module
import { SharedModule } from './shared/shared.module';

// App component
import { AppComponent } from './app.component';

@NgModule({
  imports: [
    AppRoutingModule,
    SharedModule,
  ],
  declarations: [
    AppComponent,
  ],
  providers: [
    CommonService,
    TestService,
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
