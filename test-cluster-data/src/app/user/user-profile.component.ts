
import { Component, OnInit } from '@angular/core';
import { UserService } from './user.service';
import { User, UserProfile } from './user.models';
import { UserState } from './user.state';

@Component({
  selector: 'app-user-profile',
  template: `
    <div class="profile">
      <img [src]="user?.avatar" alt="Avatar">
      <h2>{{user?.firstName}} {{user?.lastName}}</h2>
      <button (click)="editProfile()">Edit Profile</button>
    </div>
  `
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
