
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
