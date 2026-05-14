
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
