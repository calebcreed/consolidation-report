
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { AuthConfig } from './auth.config';

@Component({
  selector: 'app-logout',
  template: '<p>Logging out...</p>'
})
export class LogoutComponent implements OnInit {
  constructor(
    private authService: AuthService,
    private router: Router,
    private config: AuthConfig
  ) {}

  ngOnInit() {
    this.authService.logout();
    this.router.navigate([this.config.loginRoute]);
  }
}
