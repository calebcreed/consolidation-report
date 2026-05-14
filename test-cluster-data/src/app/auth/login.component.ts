
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { LoginCredentials } from './auth.models';
import { AuthConfig } from './auth.config';

@Component({
  selector: 'app-login',
  template: `
    <form (ngSubmit)="onSubmit()">
      <input [(ngModel)]="credentials.username" placeholder="Username">
      <input [(ngModel)]="credentials.password" type="password">
      <button type="submit">Login</button>
    </form>
  `
})
export class LoginComponent {
  credentials: LoginCredentials = { username: '', password: '' };

  constructor(
    private authService: AuthService,
    private router: Router,
    private config: AuthConfig
  ) {}

  async onSubmit() {
    await this.authService.login(this.credentials);
    this.router.navigate(['/dashboard']);
  }
}
