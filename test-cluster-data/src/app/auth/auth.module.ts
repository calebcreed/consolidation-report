
import { NgModule } from '@angular/core';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AuthInterceptor } from './auth.interceptor';
import { TokenService } from './token.service';
import { AuthConfig } from './auth.config';
import { AuthState } from './auth.state';
import { LoginComponent } from './login.component';
import { LogoutComponent } from './logout.component';

@NgModule({
  declarations: [LoginComponent, LogoutComponent],
  providers: [
    AuthService,
    AuthGuard,
    AuthInterceptor,
    TokenService,
    AuthConfig,
    AuthState
  ],
  exports: [LoginComponent, LogoutComponent]
})
export class AuthModule {}
