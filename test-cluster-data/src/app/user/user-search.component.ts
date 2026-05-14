
import { Component, Output, EventEmitter } from '@angular/core';
import { UserApi } from './user.api';
import { UserListItem } from './user.models';

@Component({
  selector: 'app-user-search',
  template: `
    <input [(ngModel)]="query" (input)="search()" placeholder="Search users...">
    <ul *ngIf="results.length">
      <li *ngFor="let user of results" (click)="select(user)">{{user.fullName}}</li>
    </ul>
  `
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
