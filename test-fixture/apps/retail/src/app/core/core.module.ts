import { NgModule, ModuleWithProviders } from '@angular/core';
import { CommonService } from './services/common.service';
import { API_URL, APP_CONFIG, AppConfig } from './tokens';

// A11: forRoot/forChild pattern - module that configures providers differently
@NgModule({
  declarations: [],
  imports: [],
  exports: [],
})
export class CoreModule {
  // A11: forRoot - called once in AppModule, provides singletons
  static forRoot(config: AppConfig): ModuleWithProviders<CoreModule> {
    return {
      ngModule: CoreModule,
      providers: [
        CommonService,
        { provide: APP_CONFIG, useValue: config },
        { provide: API_URL, useValue: config.apiUrl },
      ]
    };
  }

  // A11: forChild - called in feature modules, no singleton providers
  static forChild(): ModuleWithProviders<CoreModule> {
    return {
      ngModule: CoreModule,
      providers: []  // No providers - uses root providers
    };
  }
}
