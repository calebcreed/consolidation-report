// Single entry point - imports polyfills first, then bootstraps app
import './polyfills';

import { TestService } from '@core/test.service';

const svc = new TestService();
console.log(svc.getValue());
