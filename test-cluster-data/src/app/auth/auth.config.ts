
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthConfig {
  readonly apiBaseUrl = '/api';
  readonly loginRoute = '/login';
  readonly logoutRoute = '/logout';
  readonly tokenRefreshInterval = 300000;
  readonly sessionTimeout = 3600000;
}
