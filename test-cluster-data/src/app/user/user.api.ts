
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { User, UserProfile, UserPreferences, UserListItem } from './user.models';

@Injectable({ providedIn: 'root' })
export class UserApi {
  private readonly baseUrl = '/api/users';

  constructor(private http: HttpClient) {}

  async fetchUser(id: string): Promise<User> {
    return this.http.get<User>(`${this.baseUrl}/${id}`).toPromise();
  }

  async fetchUsers(): Promise<UserListItem[]> {
    return this.http.get<UserListItem[]>(this.baseUrl).toPromise();
  }

  async updateProfile(profile: UserProfile): Promise<User> {
    return this.http.put<User>(`${this.baseUrl}/profile`, profile).toPromise();
  }

  async updatePreferences(prefs: UserPreferences): Promise<void> {
    return this.http.put<void>(`${this.baseUrl}/preferences`, prefs).toPromise();
  }
}
