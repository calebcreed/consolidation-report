import { Injectable, Inject } from '@angular/core';

// A2: @Inject decorator - for InjectionTokens (not class-based services)
import { API_URL, APP_CONFIG, AppConfig } from '../core/tokens';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(
    @Inject(API_URL) private apiUrl: string,           // A2: token injection
    @Inject(APP_CONFIG) private config: AppConfig,     // A2: token injection
  ) {}

  getBaseUrl(): string {
    return this.apiUrl;
  }

  isProduction(): boolean {
    return this.config.production;
  }
}
