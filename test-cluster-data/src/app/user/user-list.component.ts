
import { Component, OnInit } from '@angular/core';
import { UserApi } from './user.api';
import { UserListItem } from './user.models';

@Component({
  selector: 'app-user-list',
  template: `
    <table>
      <tr *ngFor="let user of users">
        <td>{{user.fullName}}</td>
        <td>{{user.email}}</td>
        <td>{{user.status}}</td>
      </tr>
    </table>
  `
})
export class UserListComponent implements OnInit {
  users: UserListItem[] = [];

  constructor(private userApi: UserApi) {}

  async ngOnInit() {
    this.users = await this.userApi.fetchUsers();
  }
}
