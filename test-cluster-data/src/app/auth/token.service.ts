
import { Injectable } from '@angular/core';
import { AuthConfig } from './auth.config';

@Injectable({ providedIn: 'root' })
export class TokenService {
  private readonly STORAGE_KEY = 'auth_token';

  constructor(private config: AuthConfig) {}

  setToken(token: string): void {
    localStorage.setItem(this.STORAGE_KEY, token);
  }

  getToken(): string | null {
    return localStorage.getItem(this.STORAGE_KEY);
  }

  clearToken(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }

  hasValidToken(): boolean {
    const token = this.getToken();
    if (!token) return false;
    return !this.isTokenExpired(token);
  }

  private isTokenExpired(token: string): boolean {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp < Date.now() / 1000;
  }
}
