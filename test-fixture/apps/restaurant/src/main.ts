// Single entry point - imports polyfills first, then bootstraps app
import './polyfills';

import { TestService } from '@core/test.service';
// Connection 1: main.ts → app.module.ts
import { AppModule } from './app/app.module';

const svc = new TestService();
console.log(svc.getValue());
console.log('AppModule:', AppModule.name);
