import { InjectionToken } from '@angular/core';

// A2: InjectionToken - used with @Inject decorator
export const API_URL = new InjectionToken<string>('API_URL');
export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

export interface AppConfig {
  production: boolean;
  apiUrl: string;
  version: string;
}
