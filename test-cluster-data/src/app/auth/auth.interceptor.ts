
import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler } from '@angular/common/http';
import { TokenService } from './token.service';
import { AuthConfig } from './auth.config';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private tokenService: TokenService,
    private config: AuthConfig
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler) {
    const token = this.tokenService.getToken();
    if (token && this.shouldAddToken(req.url)) {
      req = req.clone({
        setHeaders: { Authorization: `Bearer ${token}` }
      });
    }
    return next.handle(req);
  }

  private shouldAddToken(url: string): boolean {
    return url.startsWith(this.config.apiBaseUrl);
  }
}
