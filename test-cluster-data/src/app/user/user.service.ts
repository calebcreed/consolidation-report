
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
