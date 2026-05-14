/**
 * Generate 100 test files with known clustering targets
 *
 * EXPECTED CLUSTERS:
 * 1. Auth (10 files) - authentication/authorization
 * 2. User (10 files) - user management
 * 3. Product (10 files) - product catalog
 * 4. Cart (10 files) - shopping cart
 * 5. Order (10 files) - order processing
 * 6. UI (10 files) - shared UI components
 * 7. Utils (10 files) - utility functions
 * 8. API (10 files) - API layer
 * 9. State (10 files) - state management
 * 10. Isolated (10 files) - no dependencies, should be unassigned
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '../test-cluster-data/src/app');

// Ensure directories exist
const dirs = ['auth', 'user', 'product', 'cart', 'order', 'ui', 'utils', 'api', 'state', 'isolated'];
dirs.forEach(d => fs.mkdirSync(path.join(BASE, d), { recursive: true }));

// Helper to write file
function write(filePath, content) {
  fs.writeFileSync(path.join(BASE, filePath), content);
  console.log(`Created: ${filePath}`);
}

// ============ CLUSTER 1: AUTH (10 files) ============
// All files heavily reference authentication concepts

write('auth/auth.service.ts', `
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
`);

write('auth/auth.guard.ts', `
import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { AuthConfig } from './auth.config';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router,
    private config: AuthConfig
  ) {}

  canActivate(): boolean {
    if (this.authService.isAuthenticated()) {
      return true;
    }
    this.router.navigate([this.config.loginRoute]);
    return false;
  }
}
`);

write('auth/auth.interceptor.ts', `
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
        setHeaders: { Authorization: \`Bearer \${token}\` }
      });
    }
    return next.handle(req);
  }

  private shouldAddToken(url: string): boolean {
    return url.startsWith(this.config.apiBaseUrl);
  }
}
`);

write('auth/token.service.ts', `
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
`);

write('auth/auth.config.ts', `
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthConfig {
  readonly apiBaseUrl = '/api';
  readonly loginRoute = '/login';
  readonly logoutRoute = '/logout';
  readonly tokenRefreshInterval = 300000;
  readonly sessionTimeout = 3600000;
}
`);

write('auth/auth.state.ts', `
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AuthUser } from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthState {
  private userSubject = new BehaviorSubject<AuthUser | null>(null);

  get user$(): Observable<AuthUser | null> {
    return this.userSubject.asObservable();
  }

  get currentUser(): AuthUser | null {
    return this.userSubject.value;
  }

  setUser(user: AuthUser): void {
    this.userSubject.next(user);
  }

  clearUser(): void {
    this.userSubject.next(null);
  }
}
`);

write('auth/auth.models.ts', `
export interface LoginCredentials {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: AuthUser;
  token: AuthToken;
}
`);

write('auth/login.component.ts', `
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { LoginCredentials } from './auth.models';
import { AuthConfig } from './auth.config';

@Component({
  selector: 'app-login',
  template: \`
    <form (ngSubmit)="onSubmit()">
      <input [(ngModel)]="credentials.username" placeholder="Username">
      <input [(ngModel)]="credentials.password" type="password">
      <button type="submit">Login</button>
    </form>
  \`
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
`);

write('auth/logout.component.ts', `
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
`);

write('auth/auth.module.ts', `
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
`);

// ============ CLUSTER 2: USER (10 files) ============

write('user/user.service.ts', `
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { User, UserProfile, UserPreferences } from './user.models';
import { UserState } from './user.state';
import { UserApi } from './user.api';

@Injectable({ providedIn: 'root' })
export class UserService {
  constructor(
    private http: HttpClient,
    private userState: UserState,
    private userApi: UserApi
  ) {}

  async getUser(id: string): Promise<User> {
    const user = await this.userApi.fetchUser(id);
    this.userState.setCurrentUser(user);
    return user;
  }

  async updateProfile(profile: UserProfile): Promise<User> {
    return this.userApi.updateProfile(profile);
  }

  async updatePreferences(prefs: UserPreferences): Promise<void> {
    return this.userApi.updatePreferences(prefs);
  }
}
`);

write('user/user.models.ts', `
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  bio?: string;
  avatar?: string;
  phone?: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark';
  language: string;
  notifications: boolean;
  newsletter: boolean;
}

export interface UserListItem {
  id: string;
  email: string;
  fullName: string;
  status: 'active' | 'inactive';
}
`);

write('user/user.state.ts', `
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { User, UserPreferences } from './user.models';

@Injectable({ providedIn: 'root' })
export class UserState {
  private currentUser$ = new BehaviorSubject<User | null>(null);
  private preferences$ = new BehaviorSubject<UserPreferences | null>(null);

  setCurrentUser(user: User): void {
    this.currentUser$.next(user);
  }

  getCurrentUser(): User | null {
    return this.currentUser$.value;
  }

  setPreferences(prefs: UserPreferences): void {
    this.preferences$.next(prefs);
  }
}
`);

write('user/user.api.ts', `
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { User, UserProfile, UserPreferences, UserListItem } from './user.models';

@Injectable({ providedIn: 'root' })
export class UserApi {
  private readonly baseUrl = '/api/users';

  constructor(private http: HttpClient) {}

  async fetchUser(id: string): Promise<User> {
    return this.http.get<User>(\`\${this.baseUrl}/\${id}\`).toPromise();
  }

  async fetchUsers(): Promise<UserListItem[]> {
    return this.http.get<UserListItem[]>(this.baseUrl).toPromise();
  }

  async updateProfile(profile: UserProfile): Promise<User> {
    return this.http.put<User>(\`\${this.baseUrl}/profile\`, profile).toPromise();
  }

  async updatePreferences(prefs: UserPreferences): Promise<void> {
    return this.http.put<void>(\`\${this.baseUrl}/preferences\`, prefs).toPromise();
  }
}
`);

write('user/user-profile.component.ts', `
import { Component, OnInit } from '@angular/core';
import { UserService } from './user.service';
import { User, UserProfile } from './user.models';
import { UserState } from './user.state';

@Component({
  selector: 'app-user-profile',
  template: \`
    <div class="profile">
      <img [src]="user?.avatar" alt="Avatar">
      <h2>{{user?.firstName}} {{user?.lastName}}</h2>
      <button (click)="editProfile()">Edit Profile</button>
    </div>
  \`
})
export class UserProfileComponent implements OnInit {
  user: User | null = null;

  constructor(
    private userService: UserService,
    private userState: UserState
  ) {}

  ngOnInit() {
    this.user = this.userState.getCurrentUser();
  }

  editProfile() {
    // Open edit modal
  }
}
`);

write('user/user-settings.component.ts', `
import { Component, OnInit } from '@angular/core';
import { UserService } from './user.service';
import { UserPreferences } from './user.models';
import { UserState } from './user.state';

@Component({
  selector: 'app-user-settings',
  template: \`
    <div class="settings">
      <h2>User Settings</h2>
      <label>Theme: <select [(ngModel)]="prefs.theme"></select></label>
      <label>Language: <select [(ngModel)]="prefs.language"></select></label>
      <button (click)="save()">Save Settings</button>
    </div>
  \`
})
export class UserSettingsComponent implements OnInit {
  prefs: UserPreferences = { theme: 'light', language: 'en', notifications: true, newsletter: false };

  constructor(
    private userService: UserService,
    private userState: UserState
  ) {}

  ngOnInit() {}

  async save() {
    await this.userService.updatePreferences(this.prefs);
  }
}
`);

write('user/user-list.component.ts', `
import { Component, OnInit } from '@angular/core';
import { UserApi } from './user.api';
import { UserListItem } from './user.models';

@Component({
  selector: 'app-user-list',
  template: \`
    <table>
      <tr *ngFor="let user of users">
        <td>{{user.fullName}}</td>
        <td>{{user.email}}</td>
        <td>{{user.status}}</td>
      </tr>
    </table>
  \`
})
export class UserListComponent implements OnInit {
  users: UserListItem[] = [];

  constructor(private userApi: UserApi) {}

  async ngOnInit() {
    this.users = await this.userApi.fetchUsers();
  }
}
`);

write('user/user-avatar.component.ts', `
import { Component, Input } from '@angular/core';
import { User } from './user.models';

@Component({
  selector: 'app-user-avatar',
  template: \`
    <div class="avatar" [class.large]="size === 'large'">
      <img *ngIf="user?.avatar" [src]="user.avatar" [alt]="user.firstName">
      <span *ngIf="!user?.avatar">{{initials}}</span>
    </div>
  \`
})
export class UserAvatarComponent {
  @Input() user: User | null = null;
  @Input() size: 'small' | 'medium' | 'large' = 'medium';

  get initials(): string {
    if (!this.user) return '?';
    return this.user.firstName[0] + this.user.lastName[0];
  }
}
`);

write('user/user-search.component.ts', `
import { Component, Output, EventEmitter } from '@angular/core';
import { UserApi } from './user.api';
import { UserListItem } from './user.models';

@Component({
  selector: 'app-user-search',
  template: \`
    <input [(ngModel)]="query" (input)="search()" placeholder="Search users...">
    <ul *ngIf="results.length">
      <li *ngFor="let user of results" (click)="select(user)">{{user.fullName}}</li>
    </ul>
  \`
})
export class UserSearchComponent {
  query = '';
  results: UserListItem[] = [];
  @Output() userSelected = new EventEmitter<UserListItem>();

  constructor(private userApi: UserApi) {}

  async search() {
    if (this.query.length < 2) return;
    this.results = await this.userApi.fetchUsers();
  }

  select(user: UserListItem) {
    this.userSelected.emit(user);
  }
}
`);

write('user/user.module.ts', `
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserService } from './user.service';
import { UserApi } from './user.api';
import { UserState } from './user.state';
import { UserProfileComponent } from './user-profile.component';
import { UserSettingsComponent } from './user-settings.component';
import { UserListComponent } from './user-list.component';
import { UserAvatarComponent } from './user-avatar.component';
import { UserSearchComponent } from './user-search.component';

@NgModule({
  imports: [CommonModule],
  declarations: [
    UserProfileComponent,
    UserSettingsComponent,
    UserListComponent,
    UserAvatarComponent,
    UserSearchComponent
  ],
  providers: [UserService, UserApi, UserState],
  exports: [
    UserProfileComponent,
    UserSettingsComponent,
    UserListComponent,
    UserAvatarComponent,
    UserSearchComponent
  ]
})
export class UserModule {}
`);

console.log('\n✓ Created Auth cluster (10 files)');
console.log('✓ Created User cluster (10 files)');
console.log('\nRun this script again with --part2 for more clusters');
