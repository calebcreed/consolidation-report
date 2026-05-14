
import { Injectable } from '@angular/core';
import { AuthConfig } from './auth.config';
import { TokenService } from './token.service';
import { AuthState } from './auth.state';
import { LoginCredentials, AuthUser } from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(
    private config: AuthConfig,
    private tokenService: TokenService,
    private authState: AuthState
  ) {}

  async login(credentials: LoginCredentials): Promise<AuthUser> {
    const response = await this.authenticate(credentials);
    this.tokenService.setToken(response.token);
    this.authState.setUser(response.user);
    return response.user;
  }

  logout(): void {
    this.tokenService.clearToken();
    this.authState.clearUser();
  }

  isAuthenticated(): boolean {
    return this.tokenService.hasValidToken();
  }
}
